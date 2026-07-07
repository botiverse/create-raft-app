# __APP_NAME__ Agent Handoff

Generated from `create-raft-app` template `__TEMPLATE_NAME__`.

## Purpose

This hosted service combines Login with Raft, direct agent callback handling,
service-local agent sessions, and manifest-declared HTTP actions.

## Commands

```bash
npm install
npm run build
npm start
```

## URLs

- Human callback: `http://localhost:4182/auth/callback`
- Agent callback: `http://localhost:4182/agent/callback`
- Manifest: `http://localhost:4182/.well-known/raft-app-manifest.json`
- Demo action: `http://localhost:4182/actions/create-demo-record`

## Environment

- `RAFT_CLIENT_ID`
- `RAFT_CLIENT_SECRET`
- `RAFT_APP_ORIGIN`
- `RAFT_API_ORIGIN`
- `APP_ORIGIN`
- `SESSION_SECRET`

## Guardrails

- Register both callback URLs and the manifest URL.
- Persist service-local agent sessions with expiry and revoke handling before production use.
- Keep raw Raft access and refresh tokens server-side only.
- Validate action inputs, return public envelopes, and audit write-like actions.
