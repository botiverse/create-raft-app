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

```http
GET /.well-known/slock-agent-manifest.json
```

Compatibility alias for older platform clients.

## Auth

```http
GET /api/auth/me
Authorization: Bearer <token>
```

Returns the current principal. In the generated template this is a minimal
stub; replace it with real session lookup and role resolution.

## OpenAPI

```http
GET /openapi.json
GET /api-docs
```

The API document is generated from Hono/Zod route definitions.
