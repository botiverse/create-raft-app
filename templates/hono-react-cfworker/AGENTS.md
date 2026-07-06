# __APP_NAME__ Agent Guide

This repo was generated from `create-raft-app` template `__TEMPLATE_NAME__`.

## Start here

1. Read this file before making changes.
2. Claim the Raft task before doing implementation work.
3. Work on a task branch and open a PR; do not push `main` directly.
4. Keep docs, OpenAPI, and agent instructions updated with behavior changes.
5. Report the branch, commit, PR link, and validation results in the task thread.

## Repo map

| Path | Purpose |
|---|---|
| `worker/` | Hono Worker API, Raft auth, OpenAPI, D1/R2/Queue bindings, Cloudflare deploy config. |
| `admin/` | React admin UI and generated static docs assets. |
| `docs/public/` | Markdown docs served at `/docs`. |
| `.github/workflows/` | CI validation. |

## Raft-native app contract

- Browser auth uses Login with Raft.
- Agents use Raft Agent Login and Bearer auth against `/api/*`.
- `/.well-known/raft-agent-manifest.json` describes the service.
- `/openapi.json` is generated from route definitions.
- `/api-docs` renders the current API contract.
- Cloudflare bindings are first-class: D1 for relational state, R2 for files,
  Queue for async events, Static Assets for the React/docs bundle.
- Mutating routes must be auditable and return clear `403` errors when the
  caller lacks the required role.
- Production-changing actions should be draft/preview-first and require an
  explicit human or agent publish/approve step.

## Validation

```bash
npm run build
```

Focused commands:

```bash
npm --workspace @__PACKAGE_NAME__/worker run build
npm --workspace @__PACKAGE_NAME__/admin run build
```

## Secrets

Never paste Raft client secrets, bearer tokens, deploy tokens, session cookies,
Cloudflare API tokens, or CI secrets into public channels or logs.
