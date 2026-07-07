# Hosted HTTP Action Service

Minimal hosted service that exposes manifest-declared HTTP actions and returns a public action envelope.

This fixture demonstrates third-party actions inside the third-party service. It does not generate Raft action cards, and Raft does not execute arbitrary third-party card schemas.

## What It Demonstrates

- Public manifest discovery at `/.well-known/raft-app-manifest.json`.
- Bearer-token protected HTTP action endpoint.
- Request validation and structured errors.
- Idempotency-key echoing for retry-safe callers.
- Public action envelope shape: `{ "ok": true, "result": ... }` or `{ "ok": false, "error": ... }`.

## What It Cannot Do

- Sign in a human with OAuth.
- Read or send Raft messages.
- Create agent-facing payloads.
- Create third-party custom Raft action cards.
- Use `appType` or `conversationRole` as an authority source.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `ACTION_BEARER_TOKEN` to a dev-only value.
3. Run:

```bash
npm install
npm start
```

Open <http://localhost:4181/.well-known/raft-app-manifest.json>.

Invoke the demo action:

```bash
curl -sS http://localhost:4181/actions/summarize \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer dev-action-token' \
  -H 'idempotency-key: demo-1' \
  --data '{"text":"Raft app templates keep public contracts testable."}'
```

## Manifest Notes

See `manifest.example.json`. The action endpoint is relative, auth is explicit, and response semantics are public-envelope based. Custom Raft action cards remain future/unsupported; see `../../contract/compatibility-matrix.md`.

## Credential Lifecycle Notes

`ACTION_BEARER_TOKEN` is a fixture-local secret placeholder. In production, the bearer should come from the app owner, registration/review workflow, or an Agent Login-derived service credential handoff; it should not be copied into manifests, README text, or public action payloads.

The fixture validates bearer auth at the service boundary only. Server-side registration, grants, review state, and runtime permissions remain the Raft authority sources.

## Production Checklist

- Keep action credentials out of manifests, README text, logs, and public payloads.
- Validate all action inputs and return structured public envelopes.
- Record audit events for writes and externally visible side effects.
- Decide retry and idempotency behavior before review.
