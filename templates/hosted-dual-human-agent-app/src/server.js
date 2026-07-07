import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4174);
const raftAppOrigin = normalizeOrigin(process.env.RAFT_APP_ORIGIN ?? "https://app.raft.build");
const raftSetupPath = process.env.RAFT_SETUP_PATH ?? "/login-with-raft/setup";
const raftApiOrigin = normalizeOrigin(process.env.RAFT_API_ORIGIN ?? "https://api.raft.build");
const appOrigin = (process.env.APP_ORIGIN ?? `http://localhost:${port}`).replace(/\/$/, "");
const clientId = process.env.RAFT_CLIENT_ID;
const clientSecret = process.env.RAFT_CLIENT_SECRET;
const oauthScope = process.env.RAFT_OAUTH_SCOPE ?? "openid profile identity";
const fixtureCapabilities = [
  "oauth.sign_in",
  "oauth.userinfo",
  "agent_login.direct_callback",
  "agent_manifest.discovery",
  "local.session",
  "http_api.session_context",
  "static.auth_gate"
];

app.use(express.json());
app.use(
  cookieSession({
    name: "raft_hosted_dual",
    secret: process.env.SESSION_SECRET ?? "dev-only-change-me",
    httpOnly: true,
    sameSite: "lax"
  })
);

function requireConfig(res) {
  if (clientId && clientSecret) return true;
  res.status(500).send("Set RAFT_CLIENT_ID and RAFT_CLIENT_SECRET before starting this fixture.");
  return false;
}

function html(body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hosted Dual Demo</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 760px; margin: 48px auto; padding: 0 20px; line-height: 1.5; }
      a, button { font: inherit; }
      pre { background: #f6f7f8; padding: 12px; overflow: auto; }
      .card { border: 1px solid #111; padding: 16px; margin: 16px 0; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

app.get("/", (req, res) => {
  const session = req.session?.principal;
  if (session) {
    res.send(
      html(`<h1>Hosted Dual Demo</h1><div class="card"><p>Signed in as <strong>${escapeHtml(session.type)}</strong>.</p><pre>${escapeHtml(JSON.stringify(safeSession(session), null, 2))}</pre></div><p><a href="/app">Open protected app</a></p><p><a href="/logout">Sign out</a></p>`)
    );
    return;
  }

  res.send(
    html(`<h1>Hosted Dual Demo</h1><p>This fixture supports browser humans and Raft agents in one hosted service.</p><p><a href="/login">Login with Raft</a></p>`)
  );
});

app.get("/login", (req, res) => {
  if (!requireConfig(res)) return;

  req.session = {
    loginState: crypto.randomBytes(16).toString("hex"),
    returnTo: normalizeReturnTo(req.query.return_to)
  };

  const setupUrl = new URL(raftSetupPath, raftAppOrigin);
  setupUrl.searchParams.set("client_id", clientId);
  setupUrl.searchParams.set("return_to", `${appOrigin}/auth/raft/callback`);
  setupUrl.searchParams.set("scope", oauthScope);
  res.redirect(setupUrl.toString());
});

app.get("/auth/raft/callback", async (req, res) => {
  if (!requireConfig(res)) return;
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    res.status(400).send("Missing callback code.");
    return;
  }

  const token = await exchangeCode(code, res);
  if (!token) return;

  const userinfo = await fetchUserinfo(token.access_token, res);
  if (!userinfo) return;

  const principal = normalizePrincipal(userinfo);
  if (!principal) {
    res.status(400).send("Unsupported principal type.");
    return;
  }

  const hasBrowserState = typeof req.session?.loginState === "string";

  if (principal.type === "human" && !hasBrowserState) {
    req.session = null;
    res.status(400).send("Human browser login requires a valid state cookie.");
    return;
  }

  if (!verifyContext(principal, userinfo, res)) return;

  const returnTo = normalizeReturnTo(req.session?.returnTo);
  req.session = {
    principal: {
      ...principal,
      serverId: userinfo.server_id ?? userinfo.serverId ?? null,
      clientId,
      authenticatedAt: new Date().toISOString()
    }
  };
  res.redirect(principal.type === "agent" ? "/api/session" : returnTo);
});

function sendAgentManifest(_req, res) {
  res.type("application/json").sendFile(new URL("../manifest.example.json", import.meta.url).pathname);
}

app.get("/.well-known/raft-agent-manifest.json", sendAgentManifest);

app.get("/api/session", (req, res) => {
  const principal = req.session?.principal;
  if (!principal) {
    res.status(401).json({ error: "SESSION_REQUIRED" });
    return;
  }
  res.json({
    principal: safeSession(principal),
    capabilities: fixtureCapabilities
  });
});

app.get("/app", requireAppSession, (req, res) => {
  res.send(html(`<h1>Protected App</h1><p>This page is behind the app-owned ${escapeHtml(req.session.principal.type)} session.</p><p><a href="/assets/protected-note.txt">Protected static route</a></p>`));
});

app.get("/assets/protected-note.txt", requireAppSession, (_req, res) => {
  res.type("text/plain").send("Protected static content reached through the app auth gate.\n");
});

app.get("/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

function requireAppSession(req, res, next) {
  if (req.session?.principal) {
    next();
    return;
  }
  res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
}

async function exchangeCode(code, res) {
  const tokenResponse = await fetch(`${raftApiOrigin}/api/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code
    })
  });

  if (!tokenResponse.ok) {
    res.status(502).send(`Token exchange failed: ${tokenResponse.status}`);
    return null;
  }
  return tokenResponse.json();
}

async function fetchUserinfo(accessToken, res) {
  const userinfoResponse = await fetch(`${raftApiOrigin}/api/oauth/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!userinfoResponse.ok) {
    res.status(502).send(`Userinfo failed: ${userinfoResponse.status}`);
    return null;
  }
  return userinfoResponse.json();
}

function normalizePrincipal(userinfo) {
  const rawType = userinfo.type ?? userinfo.principal_type ?? userinfo.principalType;
  const type = rawType === "agent" ? "agent" : rawType === "human" || rawType === "user" ? "human" : null;
  if (!type) return null;
  return {
    type,
    id: String(userinfo.sub ?? userinfo.id ?? ""),
    name: String(userinfo.name ?? userinfo.preferred_username ?? userinfo.login ?? userinfo.sub ?? "")
  };
}

function verifyContext(principal, userinfo, res) {
  const actualClientId = userinfo.client_id ?? userinfo.clientId ?? clientId;
  if (actualClientId !== clientId || !principal.id) {
    res.status(403).send("Principal is not authorized for this app context.");
    return false;
  }
  return true;
}

function safeSession(principal) {
  return {
    type: principal.type,
    id: principal.id,
    name: principal.name,
    serverId: principal.serverId,
    clientId: principal.clientId,
    authenticatedAt: principal.authenticatedAt
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeOrigin(value) {
  return String(value).replace(/\/+$/, "");
}

function normalizeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function basicAuth(id, secret) {
  return Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
}

app.listen(port, () => {
  console.log(`Hosted Dual Demo listening on ${appOrigin}`);
});
