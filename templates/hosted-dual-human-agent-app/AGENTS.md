# __APP_NAME__ Agent Handoff

Generated from `create-raft-app` template `__TEMPLATE_NAME__`.

## Purpose

This hosted app supports browser human Login with Raft and direct agent
callbacks in one deployment. Both flows create app-owned local sessions, but
the sessions are not interchangeable.

## Commands

```bash
npm install
npm run build
npm start
```

## URLs

- Shared callback: `http://localhost:4174/auth/raft/callback`
- Agent manifest: `http://localhost:4174/.well-known/raft-agent-manifest.json`
- Session context: `http://localhost:4174/api/session`

## Environment

- `RAFT_CLIENT_ID`
- `RAFT_CLIENT_SECRET`
- `RAFT_APP_ORIGIN`
- `RAFT_API_ORIGIN`
- `APP_ORIGIN`
- `SESSION_SECRET`

## Guardrails

- Register the callback URL and agent manifest URL.
- Keep direct no-state callback acceptance restricted to agent principals.
- Verify server/client context before creating a local app session.
- Never return raw Raft tokens or raw userinfo from `/api/session`.
