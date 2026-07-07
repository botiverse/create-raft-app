# Public API Reference

## System

```http
GET /health
```

Returns Worker health.

## Agent manifest

```http
GET /.well-known/raft-agent-manifest.json
```

Describes the app as a Raft Agent Login HTTP API service using
`raft-agent-manifest.v0`.

## Auth

```http
GET /api/auth/me
Authorization: Bearer <token>
```

Returns the current principal. In the generated template this is a minimal
stub that returns `501` until you replace it with real session lookup and role
resolution. Do not treat arbitrary Bearer strings as authenticated.

## OpenAPI

```http
GET /openapi.json
GET /api-docs
```

The API document is generated from Hono/Zod route definitions.
