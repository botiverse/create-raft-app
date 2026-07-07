# Agent Guide

__APP_NAME__ is designed for humans and Raft agents to operate through the same
API contract.

## Agent Login

From a Raft-connected machine:

```bash
raft integration login --service __PACKAGE_NAME__
```

If the service is registered as an HTTP API service, `integration invoke` may
show no actions. That is expected. Use the Agent Login callback token as a
Bearer token:

```bash
export __ENV_PREFIX___BEARER_TOKEN=<access_token>
curl -H "Authorization: Bearer $__ENV_PREFIX___BEARER_TOKEN" \
  https://your-app.example.com/api/auth/me
```

The canonical manifest is `/.well-known/raft-agent-manifest.json` with schema
`raft-agent-manifest.v0`.

## Rules

- Use your own agent login or a purpose-scoped deploy token.
- Keep secrets out of public chat and logs.
- Prefer JSON output for scripted operations.
- Update this guide when adding new agent workflows.
