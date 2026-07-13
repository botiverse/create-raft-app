import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

type Bindings = {
  ASSETS?: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  APP_EVENTS: Queue;
  APP_ORIGIN?: string;
  RAFT_CLIENT_ID?: string;
  // Set via `wrangler secret put RAFT_CLIENT_SECRET` after registering the app
  // with Raft. Required only for the human Login-with-Raft code exchange; agent
  // Bearer verification works without it.
  RAFT_CLIENT_SECRET?: string;
  RAFT_ORIGIN?: string;
  RAFT_API_ORIGIN?: string;
};
type AppContext = Context<{ Bindings: Bindings }>;

// Session cookie carrying the Raft access token. Set at the Login-with-Raft /
// agent-login callback; the raft CLI's agent login stores and replays it.
const SESSION_COOKIE = "raft_session";
const LOGIN_PENDING_COOKIE = "raft_login_pending";
type Principal = {
  actor: string;
  displayName: string;
  principalType: "human" | "agent";
};

const app = new OpenAPIHono<{ Bindings: Bindings }>();

const ErrorResponse = z.object({ error: z.string() }).openapi("ErrorResponse");
const PendingAuthResponse = z
  .object({
    error: z.string(),
    next_step: z.string(),
  })
  .openapi("PendingAuthResponse");
const HealthResponse = z.object({ ok: z.boolean(), service: z.string() }).openapi("HealthResponse");
const EventInput = z
  .object({
    type: z.string().min(1).max(80),
    payload: z.record(z.unknown()).default({}),
    store_file: z.boolean().default(false),
  })
  .openapi("EventInput");
const EventResponse = z
  .object({
    id: z.string(),
    queued: z.boolean(),
    r2_key: z.string().nullable(),
  })
  .openapi("EventResponse");
const MeResponse = z
  .object({
    ok: z.literal(true),
    account: z.object({
      display_name: z.string(),
      principal_type: z.enum(["human", "agent"]),
    }),
  })
  .openapi("MeResponse");

function originFromRequest(c: { req: { url: string }; env: Bindings }) {
  return c.env.APP_ORIGIN || new URL(c.req.url).origin;
}

function bearer(c: { req: { header(name: string): string | undefined } }) {
  const header = c.req.header("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

// A caller's token: Authorization: Bearer (agents/CLIs) or the session cookie
// set at the callback (browsers, and the raft CLI which replays a Set-Cookie).
function sessionToken(c: AppContext): string {
  return bearer(c) || getCookie(c, SESSION_COOKIE) || "";
}

// Verify a token against Raft's userinfo endpoint. Works for any valid Raft
// access token (agent or human) — no per-app secret required.
async function resolvePrincipal(token: string, env: Bindings): Promise<Principal | null> {
  if (!token) return null;
  const apiOrigin = env.RAFT_API_ORIGIN || "https://api.raft.build";
  try {
    const res = await fetch(`${apiOrigin}/api/oauth/userinfo`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const info = (await res.json()) as {
      sub?: string;
      type?: string;
      name?: string;
      preferred_username?: string;
      server_slug?: string;
      server_id?: string;
    };
    if (!info.sub) return null;
    const handle = info.preferred_username || info.name || info.sub;
    const server = info.server_slug || info.server_id || "raft";
    return {
      actor: `raft:${handle}@${server}`,
      displayName: info.name || info.preferred_username || "Raft user",
      principalType: info.type === "agent" ? "agent" : "human",
    };
  } catch {
    return null;
  }
}

// Clear a session cookie whose token no longer verifies, so a stale/expired
// cookie can't wedge the app into a permanent 401.
function clearStaleSessionCookie(c: AppContext) {
  if (getCookie(c, SESSION_COOKIE)) deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// Exchange a Login-with-Raft authorization code for an access token. Requires
// RAFT_CLIENT_SECRET (set after registering the app with Raft).
async function exchangeRaftCode(
  env: Bindings,
  code: string,
): Promise<{ access_token: string; expires_in?: number } | null> {
  if (!env.RAFT_CLIENT_SECRET) return null;
  const apiOrigin = env.RAFT_API_ORIGIN || "https://api.raft.build";
  const clientId = env.RAFT_CLIENT_ID || "app";
  const basic = btoa(`${clientId}:${env.RAFT_CLIENT_SECRET}`);
  const res = await fetch(`${apiOrigin}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${basic}` },
    body: JSON.stringify({ grant_type: "authorization_code", code }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { access_token: string; expires_in?: number };
}

function authNotConfigured(c: AppContext) {
  return c.json({
    error: "Login with Raft is not configured yet.",
    next_step: "Register this app with Raft, then set RAFT_CLIENT_SECRET (`wrangler secret put RAFT_CLIENT_SECRET`) and RAFT_CLIENT_ID so the callback can exchange the code. Agent Bearer auth already works.",
  }, 501);
}

function agentManifest(c: { req: { url: string }; env: Bindings }) {
  const origin = originFromRequest(c);
  return {
    schema: "raft-agent-manifest.v0",
    service: c.env.RAFT_CLIENT_ID || "__PACKAGE_NAME__",
    docs_url: `${origin}/docs/`,
    execution: {
      mode: "http_api",
      base_url: `${origin}/api`,
    },
    context_check: {
      url: `${origin}/api/auth/me`,
      method: "GET",
    },
  };
}

app.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["System"],
    responses: {
      200: {
        description: "Health check.",
        content: { "application/json": { schema: HealthResponse } },
      },
    },
  }),
  (c) => c.json({ ok: true, service: "__PACKAGE_NAME__" }),
);

app.get("/.well-known/raft-agent-manifest.json", (c) => c.json(agentManifest(c)));

app.openapi(
  createRoute({
    method: "get",
    path: "/api/auth/me",
    tags: ["Auth"],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Current principal.",
        content: { "application/json": { schema: MeResponse } },
      },
      401: {
        description: "Missing Bearer token.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      501: {
        description: "Generated app still needs real Raft session verification.",
        content: { "application/json": { schema: PendingAuthResponse } },
      },
    },
  }),
  async (c) => {
    const token = sessionToken(c);
    if (!token) {
      return c.json({ error: "missing bearer token; use Login with Raft or Raft Agent Login" }, 401);
    }
    const principal = await resolvePrincipal(token, c.env);
    if (!principal) {
      clearStaleSessionCookie(c);
      return c.json({ error: "invalid or unverifiable Raft token" }, 401);
    }
    return c.json({
      ok: true as const,
      account: {
        display_name: principal.displayName,
        principal_type: principal.principalType,
      },
    }, 200);
  },
);

function callbackUrl(c: AppContext) {
  return `${originFromRequest(c)}/login/raft/callback`;
}

app.get("/api/auth/login", (c) => {
  const raftOrigin = c.env.RAFT_ORIGIN || "https://app.raft.build";
  // Mark a pending browser login so the callback can tell humans (redirect back)
  // from agents (return JSON) apart.
  setCookie(c, LOGIN_PENDING_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  const setup = new URL("/login-with-raft/setup", raftOrigin);
  setup.searchParams.set("client_id", c.env.RAFT_CLIENT_ID || "__PACKAGE_NAME__");
  setup.searchParams.set("return_to", callbackUrl(c));
  setup.searchParams.set("scope", "openid profile");
  return c.redirect(setup.toString(), 302);
});

app.get("/login/raft/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "missing code" }, 400);
  const hadPendingBrowserLogin = Boolean(getCookie(c, LOGIN_PENDING_COOKIE));
  deleteCookie(c, LOGIN_PENDING_COOKIE, { path: "/" });

  // Requires RAFT_CLIENT_SECRET + a registered app. Agent Bearer auth works
  // without this; only the human browser exchange needs it.
  const token = await exchangeRaftCode(c.env, code);
  if (!token?.access_token) {
    return authNotConfigured(c);
  }
  const principal = await resolvePrincipal(token.access_token, c.env);
  if (!principal) {
    return c.json({ error: "could not verify Raft identity after exchange" }, 502);
  }

  // Session cookie carries the Raft access token; every request re-verifies it
  // via userinfo (stateless — no session table).
  const maxAge = token.expires_in && token.expires_in > 0 ? token.expires_in : 3600;
  setCookie(c, SESSION_COOKIE, token.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge,
  });
  c.header("cache-control", "no-store");

  if (hadPendingBrowserLogin) {
    return c.redirect("/", 302);
  }
  // Agent login (raft integration login): return the token + identity as JSON.
  return c.json({
    access_token: token.access_token,
    expires_in: maxAge,
    account: {
      display_name: principal.displayName,
      principal_type: principal.principalType,
    },
  });
});

app.openapi(
  createRoute({
    method: "get",
    path: "/api/hello",
    tags: ["Example"],
    responses: {
      200: {
        description: "Example API route.",
        content: {
          "application/json": {
            schema: z.object({ message: z.string() }).openapi("HelloResponse"),
          },
        },
      },
    },
  }),
  (c) => c.json({ message: "Hello from __APP_NAME__" }),
);

app.openapi(
  createRoute({
    method: "post",
    path: "/api/events",
    tags: ["Example"],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: EventInput,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Example event persisted to D1, optionally copied to R2, and queued.",
        content: { "application/json": { schema: EventResponse } },
      },
      401: {
        description: "Missing Bearer token.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      501: {
        description: "Generated app still needs real Raft session verification.",
        content: { "application/json": { schema: PendingAuthResponse } },
      },
    },
  }),
  async (c) => {
    const token = sessionToken(c);
    if (!token) {
      return c.json({ error: "missing bearer token; use Login with Raft or Raft Agent Login" }, 401);
    }
    const principal = await resolvePrincipal(token, c.env);
    if (!principal) {
      clearStaleSessionCookie(c);
      return c.json({ error: "invalid or unverifiable Raft token" }, 401);
    }

    const body = await c.req.json();
    const parsed = EventInput.parse(body);
    const id = crypto.randomUUID();
    const now = Date.now();
    const r2Key = parsed.store_file ? `events/${id}.json` : null;
    const payloadJson = JSON.stringify(parsed.payload);

    if (r2Key) {
      await c.env.FILES.put(r2Key, payloadJson, {
        httpMetadata: { contentType: "application/json" },
      });
    }

    await c.env.DB.prepare(
      `INSERT INTO app_events (id, type, actor, payload_json, r2_key, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(id, parsed.type, principal.actor, payloadJson, r2Key, now)
      .run();

    await c.env.APP_EVENTS.send({
      id,
      type: parsed.type,
      r2_key: r2Key,
      created_at: now,
    });

    return c.json({ id, queued: true, r2_key: r2Key }, 201);
  },
);

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "__APP_NAME__ API",
    version: "0.1.0",
    description: "Generated API contract for a Raft-native Hono Worker app.",
  },
  servers: [{ url: "/", description: "Current origin" }],
});

app.get("/api-docs", (c) => c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>__APP_NAME__ API Docs</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    header { height: 56px; display: flex; align-items: center; padding: 0 18px; border-bottom: 1px solid #e2e8f0; }
    header a { color: #0f172a; font-weight: 700; text-decoration: none; }
    #app { min-height: calc(100vh - 57px); }
  </style>
</head>
<body>
  <header><a href="/">__APP_NAME__</a></header>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference("#app", {
      url: "/openapi.json",
      theme: "default"
    });
  </script>
</body>
</html>`));

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "Bearer token from Raft Agent Login or a service-specific session.",
});

app.notFound((c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.json({ error: "not found" }, 404);
});

export default app;
