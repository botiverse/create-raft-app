# __APP_NAME__ Agent Handoff

Generated from `create-raft-app` template `__TEMPLATE_NAME__`.

## Purpose

This is a minimal human Login with Raft app. It signs a browser user in,
calls `/api/oauth/userinfo`, and stores a local app session. It does not expose
agent callbacks, actions, message access, or agent-facing payloads.

## Commands

```bash
npm install
npm run build
npm start
```

## Required Configuration

- `RAFT_CLIENT_ID`
- `RAFT_CLIENT_SECRET`
- `RAFT_APP_ORIGIN`
- `RAFT_API_ORIGIN`
- `APP_ORIGIN`
- `SESSION_SECRET`

## Registration

- Callback URL: `http://localhost:4173/auth/callback`
- Public scopes: `openid profile identity`
- Optional registration draft: `raft-app-init.json`

## Guardrails

- Keep the client secret server-side.
- Do not return raw Raft tokens from local session responses.
- Do not add message, action, or agent scopes unless the app implements and reviews them.
