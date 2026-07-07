# __APP_NAME__ Agent Handoff

Generated from `create-raft-app` template `__TEMPLATE_NAME__`.

## Purpose

This hosted service exposes manifest-declared HTTP actions and returns public
action envelopes. It does not sign in humans, read messages, send messages, or
create custom Raft action cards.

## Commands

```bash
npm install
npm run build
npm start
```

## URLs

- Manifest: `http://localhost:4181/.well-known/raft-app-manifest.json`
- Demo action: `http://localhost:4181/actions/summarize`

## Environment

- `APP_ORIGIN`
- `ACTION_BEARER_TOKEN`

## Guardrails

- Replace the dev bearer token before production use.
- Keep action credentials out of manifests, README text, logs, and public payloads.
- Validate action input and return structured public envelopes.
- Audit write-like actions and externally visible side effects.
