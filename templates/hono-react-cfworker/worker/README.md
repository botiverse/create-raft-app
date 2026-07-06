# Worker

The Worker owns API routes, Raft auth integration points, OpenAPI generation,
and Cloudflare bindings.

## Provision Cloudflare resources

Create the backing infrastructure once per environment:

```bash
cd worker

npx wrangler d1 create __PACKAGE_NAME__
npx wrangler r2 bucket create __PACKAGE_NAME__-files
npx wrangler queues create __PACKAGE_NAME__-events
```

Copy the D1 `database_id` returned by Wrangler into `wrangler.toml`, then
apply migrations:

```bash
npx wrangler d1 migrations apply __PACKAGE_NAME__ --local
npx wrangler d1 migrations apply __PACKAGE_NAME__ --remote
```

Set the Raft client secret as a Worker secret:

```bash
npx wrangler secret put RAFT_CLIENT_SECRET
```

## Bindings

| Binding | Type | Use |
|---|---|---|
| `DB` | D1 | App state, audit rows, and relational data. |
| `FILES` | R2 | User uploads, attachments, exports, and generated artifacts. |
| `APP_EVENTS` | Queue | Async jobs and webhook/event fan-out. |
| `ASSETS` | Static Assets | React admin bundle and generated docs. |

`POST /api/events` is a small example route that writes metadata to D1,
stores optional payload bytes in R2, and emits a Queue message. Replace it
with your product domain routes, but keep the binding shape.

## Raft manifest

The canonical Agent Login manifest route is
`/.well-known/raft-agent-manifest.json` with schema
`raft-agent-manifest.v0`. The Worker also serves
`/.well-known/slock-agent-manifest.json` as a compatibility alias for older
platform clients.
