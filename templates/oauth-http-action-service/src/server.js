import crypto from "node:crypto";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4182);
const raftAppOrigin = (process.env.RAFT_APP_ORIGIN ?? "https://app.raft.build").replace(/\/$/, "");
const raftSetupPath = process.env.RAFT_SETUP_PATH ?? "/login-with-raft/setup";
const raftApiOrigin = (process.env.RAFT_API_ORIGIN ?? "https://api.raft.build").replace(/\/$/, "");
const appOrigin = (process.env.APP_ORIGIN ?? `http://localhost:${port}`).replace(/\/$/, "");
const clientId = process.env.RAFT_CLIENT_ID;
const clientSecret = process.env.RAFT_CLIENT_SECRET;
const agentSessions = new Map();

app.use(express.json({ limit: "32kb" }));
app.use(
  cookieSession({
    name: "raft_oauth_action_demo",
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
    <title>OAuth + HTTP Action Demo</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 760px; margin: 48px auto; padding: 0 20px; line-height: 1.5; }
      a, button { font: inherit; }
      pre { background: #f6f7f8; padding: 12px; overflow: auto; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function actionEnvelope(result, meta = {}) {
  return { ok: true, result, meta };
}

function errorEnvelope(code, message, status = 400) {
  return {
    status,
    body: {
      ok: false,
      error: { code, message }
    }
  };
}

function manifest() {
  return {
    name: "OAuth + HTTP Action Service Demo",
    description: "Login with Raft plus service-local agent session and HTTP action endpoint.",
    manifestVersion: "0.1",
    appType: "http_api_with_login",
    conversationRole: "tool_api",
    baseUrl: appOrigin,
    oauth: {
      setupUrl: `${raftAppOrigin}${raftSetupPath}`,
      tokenUrl: `${raftApiOrigin}/api/oauth/token`,
      userinfoUrl: `${raftApiOrigin}/api/oauth/userinfo`,
      redirectUris: [`${appOrigin}/auth/callback`, `${appOrigin}/agent/callback`],
      scopes: ["openid", "profile", "identity"]
    },
    agentLogin: {
      callback: `${appOrigin}/agent/callback`,
      returns: "service-local-agent-session",
      rawRaftTokenExposure: false,
      revoke: {
        method: "DELETE",
        path: "/agent/session",
        auth: "service-local-agent-session"
      }
    },
    actions: [
      {
        name: "create-demo-record",
        method: "POST",
        path: "/actions/create-demo-record",
        auth: { type: "service-local-agent-session" },
        response: { envelope: "public_action_envelope" }
      }
    ],
    unsupported: ["messages.read", "messages.send", "custom_action_card", "agent_facing_payload"]
  };
}

async function exchangeCode(code, redirectUri) {
  const tokenResponse = await fetch(`${raftApiOrigin}/api/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  return tokenResponse.json();
}

async function fetchUserinfo(accessToken) {
  const userinfoResponse = await fetch(`${raftApiOrigin}/api/oauth/userinfo`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!userinfoResponse.ok) {
    throw new Error(`Userinfo failed: ${userinfoResponse.status}`);
  }

  return userinfoResponse.json();
}

function requireAgentSession(req, res, next) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const session = agentSessions.get(token);
  if (!session) {
    const error = errorEnvelope("UNAUTHORIZED", "Missing or invalid service-local agent session.", 401);
    res.status(error.status).json(error.body);
    return;
  }
  req.agentSession = session;
  next();
}

app.get("/", (req, res) => {
  const user = req.session?.user;
  if (user) {
    res.send(
      html(`<h1>Signed in</h1><pre>${escapeHtml(JSON.stringify(user, null, 2))}</pre><p><a href="/logout">Sign out</a></p>`)
    );
    return;
  }

  res.send(
    html(`<h1>OAuth + HTTP Action Demo</h1><p>This fixture signs humans in and exposes an agent action endpoint.</p><p><a href="/auth/login">Login with Raft</a></p>`)
  );
});

app.get("/.well-known/raft-app-manifest.json", (_req, res) => {
  res.json(manifest());
});

app.get("/auth/login", (req, res) => {
  if (!requireConfig(res)) return;

  const state = crypto.randomBytes(16).toString("hex");
  req.session = { state };

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    return_to: `${appOrigin}/auth/callback`,
    scope: "openid profile identity",
    state
  });

  res.redirect(`${raftAppOrigin}${raftSetupPath}?${params.toString()}`);
});

app.get("/auth/callback", async (req, res) => {
  if (!requireConfig(res)) return;
  if (!req.query.code || req.query.state !== req.session?.state) {
    res.status(400).send("Invalid OAuth callback state.");
    return;
  }

  try {
    const token = await exchangeCode(String(req.query.code), `${appOrigin}/auth/callback`);
    req.session = { user: await fetchUserinfo(token.access_token) };
    res.redirect("/");
  } catch (error) {
    res.status(502).send(error.message);
  }
});

app.get("/agent/callback", async (req, res) => {
  if (!requireConfig(res)) return;
  if (!req.query.code) {
    res.status(400).json(errorEnvelope("INVALID_CALLBACK", "Missing code query parameter.").body);
    return;
  }

  try {
    const token = await exchangeCode(String(req.query.code), `${appOrigin}/agent/callback`);
    const principal = await fetchUserinfo(token.access_token);
    const agentSessionToken = crypto.randomBytes(24).toString("base64url");
    agentSessions.set(agentSessionToken, {
      principal,
      createdAt: new Date().toISOString()
    });
    res.json({
      ok: true,
      agentSessionToken,
      tokenType: "service-local-agent-session",
      principal,
      rawRaftTokenExposed: false
    });
  } catch (error) {
    res.status(502).json(errorEnvelope("AGENT_LOGIN_FAILED", error.message, 502).body);
  }
});

app.post("/actions/create-demo-record", requireAgentSession, (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    const error = errorEnvelope("INVALID_PARAMS", "Request JSON must include a non-empty title string.");
    res.status(error.status).json(error.body);
    return;
  }

  res.json(
    actionEnvelope(
      {
        id: crypto.randomUUID(),
        title,
        createdAt: new Date().toISOString(),
        owner: req.agentSession.principal.sub ?? req.agentSession.principal.id ?? "unknown"
      },
      {
        sessionType: "service-local-agent-session"
      }
    )
  );
});

app.delete("/agent/session", requireAgentSession, (req, res) => {
  const token = req.header("authorization").slice("Bearer ".length);
  agentSessions.delete(token);
  res.json(actionEnvelope({ revoked: true }));
});

app.get("/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

app.listen(port, () => {
  console.log(`OAuth + HTTP Action Service fixture listening on ${appOrigin}`);
});
