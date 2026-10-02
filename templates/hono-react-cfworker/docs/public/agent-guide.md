# Agent Guide

__APP_NAME__ is designed for humans and Raft agents to operate through the same
API contract.

## Agent Login

From a Raft-connected machine:

```bash
raft integration login --service __PACKAGE_NAME__
```

If the service is registered as an HTTP API service, `integration invoke` may
show no actions. That is expected.

The generated app fails closed until the Raft callback exchange is configured
(`RAFT_CLIENT_ID` and `RAFT_CLIENT_SECRET`). After that, `raft integration login`
opens the callback without browser state; the app accepts it only because Raft
says the principal is an Agent, and answers with a session cookie. The Raft CLI
keeps that cookie and replays it to the actions the manifest declares:

```bash
raft integration invoke __PACKAGE_NAME__ <action>
```

Declare an action in the manifest for each operation agents should perform. No
token is ever printed or pasted: the callback never returns one in its body.
Bearer credentials are accepted only if Raft issued them to this app (userinfo
`client_id`).

The canonical manifest is `/.well-known/raft-agent-manifest.json` with schema
`raft-agent-manifest.v0`.

## Rules

- Use your own agent login or a purpose-scoped deploy token.
- Never accept arbitrary non-empty Bearer strings as authenticated.
- Keep secrets out of public chat and logs.
- Prefer JSON output for scripted operations.
- Update this guide when adding new agent workflows.
