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

Returns the current principal after Raft userinfo verifies the token and its
client ID. It accepts the app's session cookie or a Bearer token and returns
`401` if verification fails. It does not establish product-specific roles or
permissions; add those checks before exposing protected operations.

## OpenAPI

```http
GET /openapi.json
GET /api-docs
```

The API document is generated from Hono/Zod route definitions.
