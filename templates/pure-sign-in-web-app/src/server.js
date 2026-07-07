import crypto from "node:crypto";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4173);
const raftAppOrigin = (process.env.RAFT_APP_ORIGIN ?? "https://app.raft.build").replace(/\/$/, "");
const raftSetupPath = process.env.RAFT_SETUP_PATH ?? "/login-with-raft/setup";
const raftApiOrigin = (process.env.RAFT_API_ORIGIN ?? "https://api.raft.build").replace(/\/$/, "");
const appOrigin = (process.env.APP_ORIGIN ?? `http://localhost:${port}`).replace(/\/$/, "");
const clientId = process.env.RAFT_CLIENT_ID;
const clientSecret = process.env.RAFT_CLIENT_SECRET;

app.use(
  cookieSession({
    name: "raft_pure_sign_in",
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
    <title>Pure Sign-In Demo</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 20px; line-height: 1.5; }
      a, button { font: inherit; }
      pre { background: #f6f7f8; padding: 12px; overflow: auto; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

app.get("/", (req, res) => {
  if (req.session?.user) {
    res.send(
      html(`<h1>Signed in</h1><pre>${escapeHtml(JSON.stringify(req.session.user, null, 2))}</pre><p><a href="/logout">Sign out</a></p>`)
    );
    return;
  }

  res.send(
    html(`<h1>Pure Sign-In Demo</h1><p>This fixture only signs in and reads userinfo.</p><p><a href="/auth/login">Login with Raft</a></p>`)
  );
});

app.get("/auth/login", (req, res) => {
  if (!requireConfig(res)) return;

  const state = crypto.randomBytes(16).toString("hex");
  req.session = { state };

  const params = new URLSearchParams({
    client_id: clientId,
    return_to: `${appOrigin}/auth/callback`,
    state
  });

  res.redirect(`${raftAppOrigin}${withLeadingSlash(raftSetupPath)}?${params.toString()}`);
});

app.get("/auth/callback", async (req, res) => {
  if (!requireConfig(res)) return;
  if (!req.query.code || req.query.state !== req.session?.state) {
    res.status(400).send("Invalid OAuth callback state.");
    return;
  }

  const tokenResponse = await fetch(`${raftApiOrigin}/api/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(req.query.code),
      redirect_uri: `${appOrigin}/auth/callback`
    })
  });

  if (!tokenResponse.ok) {
    res.status(502).send(`Token exchange failed: ${tokenResponse.status}`);
    return;
  }

  const token = await tokenResponse.json();
  const userinfoResponse = await fetch(`${raftApiOrigin}/api/oauth/userinfo`, {
    headers: {
      authorization: `Bearer ${token.access_token}`
    }
  });

  if (!userinfoResponse.ok) {
    res.status(502).send(`Userinfo failed: ${userinfoResponse.status}`);
    return;
  }

  req.session = { user: await userinfoResponse.json() };
  res.redirect("/");
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

function withLeadingSlash(value) {
  return value.startsWith("/") ? value : `/${value}`;
}

app.listen(port, () => {
  console.log(`Pure Sign-In Demo listening on ${appOrigin}`);
});
