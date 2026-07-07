# __APP_NAME__ Agent Handoff

Generated from `create-raft-app` template `__TEMPLATE_NAME__`.

## Purpose

This project wraps an existing local CLI so Raft agents can run it with
per-agent filesystem isolation. Raft does not become the wrapped command, and
the wrapped command does not gain Raft message-sending authority.

## Commands

```bash
npm run build
npm start
npm run demo:write
```

## Runtime Contract

- Manifest: `manifest.example.json`
- Wrapper entrypoint: `node src/wrapper.js -- <third-party-cli> <args>`
- Demo command: `node src/wrapper.js -- node src/demo-cli.js status`

## Environment

- `RAFT_AGENT_ID`
- `RAFT_AGENT_HOME`
- `RAFT_AGENT_TOKEN_FILE`
- `RAFT_APP_ID`

## Guardrails

- Pin the production command path during registration or review.
- Keep credentials in the runner-owned handoff path, not in the manifest or README.
- Preserve stdout, stderr, timeout, and exit-code behavior explicitly.
