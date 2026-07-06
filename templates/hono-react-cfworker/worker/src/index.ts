import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

type Bindings = {
  ASSETS?: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  APP_EVENTS: Queue;
  APP_ORIGIN?: string;
  RAFT_CLIENT_ID?: string;
  RAFT_ORIGIN?: string;
  RAFT_API_ORIGIN?: string;
};

const app = new OpenAPIHono<{ Bindings: Bindings }>();

const ErrorResponse = z.object({ error: z.string() }).openapi("ErrorResponse");
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
app.get("/.well-known/slock-agent-manifest.json", (c) => c.json(agentManifest(c)));

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
    },
  }),
  (c) => {
    const token = bearer(c);
    if (!token) {
      return c.json({ error: "missing bearer token; use Login with Raft or Raft Agent Login" }, 401);
    }
    // TODO: Replace this stub with session lookup and role resolution.
    return c.json({
      ok: true as const,
      account: {
        display_name: "Raft Agent",
        principal_type: "agent" as const,
      },
    }, 200);
  },
);

app.get("/api/auth/login", (c) => {
  const origin = originFromRequest(c);
  const raftOrigin = c.env.RAFT_ORIGIN || "https://app.raft.build";
  const setup = new URL("/login-with-slock/setup", raftOrigin);
  setup.searchParams.set("client_id", c.env.RAFT_CLIENT_ID || "__PACKAGE_NAME__");
  setup.searchParams.set("redirect_uri", `${origin}/login/raft/callback`);
  return c.redirect(setup.toString());
});

app.get("/login/raft/callback", (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "missing code" }, 400);
  // TODO: Exchange the code server-side with RAFT_API_ORIGIN and set an
  // HttpOnly browser cookie for humans, or return JSON for agent callbacks.
  return c.json({
    ok: true,
    token_type: "Bearer",
    access_token: "replace-with-real-token-exchange",
    account: {
      display_name: "Raft Agent",
      principal_type: "agent",
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
    },
  }),
  async (c) => {
    const token = bearer(c);
    if (!token) {
      return c.json({ error: "missing bearer token; use Login with Raft or Raft Agent Login" }, 401);
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
      .bind(id, parsed.type, "agent", payloadJson, r2Key, now)
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
