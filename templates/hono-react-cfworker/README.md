# __APP_NAME__

Generated from `create-raft-app` template `__TEMPLATE_NAME__`.

This is a Raft-native Cloudflare app:

- `worker/` — Hono Worker API, Agent Login manifest, OpenAPI, and API docs.
- `admin/` — React admin frontend and static docs shell.
- `docs/public/` — public docs rendered into the admin assets.
- `AGENTS.md` — first-page guide for AI agents working in this repo.

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

Before production deploy, configure Worker vars/secrets:

- `RAFT_CLIENT_ID`
- `RAFT_CLIENT_SECRET`
- `RAFT_ORIGIN`
- `RAFT_API_ORIGIN`
- `APP_ORIGIN`

The generated routes expose:

- `/.well-known/raft-agent-manifest.json`
- `/api/auth/login`
- `/login/raft/callback`
- `/api/auth/me`
- `/openapi.json`
- `/api-docs`

Fill in the OAuth exchange and product-specific routes before production use.
