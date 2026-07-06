# __APP_NAME__

Generated from `create-raft-app` template `__TEMPLATE_NAME__`.

This is a Raft-native Cloudflare app:

- `worker/` — Hono Worker API, Agent Login manifest, OpenAPI, API docs,
  and D1/R2/Queue bindings.
- `admin/` — React admin frontend and static docs shell.
- `docs/public/` — public docs rendered into the admin assets.
- `AGENTS.md` — first-page guide for AI agents working in this repo.
- `raft-template.json` — Raft template descriptor aligned with the
  `raft-app-templates` conformance contract.
- Cloudflare bindings: D1 (`DB`), R2 (`FILES`), Queue (`APP_EVENTS`), and
  Static Assets (`ASSETS`).

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Raft setup

Before production deploy, configure these Worker vars/secrets:

- `RAFT_CLIENT_ID`
- `RAFT_CLIENT_SECRET`
- `APP_ORIGIN`

`RAFT_ORIGIN` and `RAFT_API_ORIGIN` already default to production Raft in
`worker/wrangler.toml`. Override them only for non-production or self-hosted
Raft environments.

The generated routes expose:

- `/.well-known/raft-agent-manifest.json`
- `/.well-known/slock-agent-manifest.json` (compat alias)
- `/api/auth/login`
- `/login/raft/callback`
- `/api/auth/me`
- `/openapi.json`
- `/api-docs`

Fill in the OAuth exchange and product-specific routes before production use.

## Infrastructure

The Worker template uses `wrangler.toml` and includes D1/R2/Queue bindings.
Provision them before deploy:

```bash
cd worker
npx wrangler d1 create __PACKAGE_NAME__
npx wrangler r2 bucket create __PACKAGE_NAME__-files
npx wrangler queues create __PACKAGE_NAME__-events
npx wrangler d1 migrations apply __PACKAGE_NAME__ --remote
```
