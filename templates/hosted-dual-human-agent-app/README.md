# Hosted Dual Human + Agent App

Minimal hosted app for services that support both browser users and Raft agents in the same deployment.

This is a local fixture, not a production-ready login. Its direct Agent
callback is not bound to the initiating CLI and shares a browser session:
separate and secure these flows before deployment. Agent identity after code
exchange is not proof that the browser initiated the callback.

This fixture is based on a generic hosted human+agent app pattern: a human opens a web UI and signs in with Login with Raft, while an agent discovers the same service through the agent manifest and completes a direct Agent Login callback. Both flows create app-owned local sessions, but they are not interchangeable.

## What It Demonstrates

- Human browser Login with Raft through the setup page using a browser-session callback proof.
- Agent direct callback without browser state, accepted only for agent principals.
- `/.well-known/raft-agent-manifest.json` discovery with no private content or tokens.
- `/api/session` returning local principal/context only.
- Protected page and protected static route gating through the app layer.
- Checks that userinfo names the configured client and a Server before creating a local app session. This is not an app-specific Server allowlist or authorization check.

## What It Cannot Do

- Create a human session from a direct no-state human callback.
- Return Raft access tokens, refresh tokens, or raw userinfo.
- Read or send Raft messages.
- Inject inbound events into an agent runtime.
- Define third-party custom Raft action cards.
- Bypass server-side registration, grants, scopes, review state, or runtime permission checks.

## Setup

1. Copy `.env.example` to `.env`.
2. Register a server-local app in Raft with return/callback URI `http://localhost:4174/auth/raft/callback`.
3. Configure an agent manifest URL pointing at `http://localhost:4174/.well-known/raft-agent-manifest.json`.
4. Fill `RAFT_CLIENT_ID` and `RAFT_CLIENT_SECRET`.
5. Confirm `RAFT_APP_ORIGIN`, `RAFT_SETUP_PATH`, and `RAFT_API_ORIGIN` match the Raft environment you registered against.
6. Run:

```bash
npm install
npm start
```

Open <http://localhost:4174>.

`/.well-known/raft-agent-manifest.json` is the Raft-branded manifest path for agent
discovery. Keep the manifest public and free of credentials.

Private or server-local access control belongs to Raft registration, install, and grant
state. This template intentionally does not hard-code a server allowlist inside the app.

## Callback Contract

- Browser human login starts at `/login`; it stores a short-lived state in the browser session and sends the same state to `${RAFT_APP_ORIGIN}${RAFT_SETUP_PATH}`. The callback checks both before exchanging the code.
- `/auth/raft/callback` exchanges codes through `${RAFT_API_ORIGIN}/api/oauth/token` and reads `${RAFT_API_ORIGIN}/api/oauth/userinfo`.
- `/auth/raft/callback` rejects missing browser-session proof for human principals.
- `/auth/raft/callback` accepts a missing browser-session proof only when the exchanged principal is an agent.
- Wrong or absent `client_id`, absent Server context, or unsupported principal type fails without creating a session. An app that is restricted to particular Servers must check them separately.
- Local session cookies are app-owned; logging out clears only this app session.

## Agent Manifest Notes

See `manifest.example.json`. The manifest is public discovery metadata only. It does not contain credentials and does not grant authority by itself.

## Safe Context API

`/api/session` returns:

- local principal type;
- principal id/name;
- Raft server id;
- app client id;
- fixture capability labels.

It must not return:

- Raft access token;
- refresh token;
- raw `/api/oauth/userinfo` body;
- client secret;
- credential-shaped values from provider callbacks.

## Production Token And Session Notes

This fixture exchanges the Raft code, reads userinfo, and then discards the Raft access token. That is the safest default for a local-session demo.

If a production app keeps Raft access or refresh tokens for ongoing server-side API calls:

- store tokens only server-side, encrypted or in a managed secret/session store;
- track token expiry and refresh before long-running human or agent workflows need Raft API calls;
- fail closed when refresh fails, then require the human or agent to re-authorize;
- never return retained tokens through `/api/session`, static pages, logs, or agent-visible context payloads.

## Production Checklist

- Register the exact callback and manifest URLs for the deployed origin.
- Verify server/client context before creating a local app session.
- Keep raw Raft tokens and raw userinfo out of local session APIs, static pages, logs, and agent-visible payloads.
- Decide whether the app is private, server-local, server-shared, or public marketplace before review.
- Document ownership, support URL, privacy boundaries, and revoke behavior before deploying.
