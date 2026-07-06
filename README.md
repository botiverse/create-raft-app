# create-raft-app

Create Raft-native apps from maintained templates.

The first template is `hono-react-cfworker`: a Cloudflare Worker API using
Hono, a React admin frontend, generated OpenAPI, public docs, `AGENTS.md`,
and Raft/Agent Login integration points.

## Usage

```bash
npm create raft-app@latest my-raft-app
```

Choose a template when prompted, or pass it explicitly:

```bash
npm create raft-app@latest my-raft-app -- --template hono-react-cfworker
```

Local development from this repo:

```bash
node bin/create-raft-app.mjs my-raft-app --template hono-react-cfworker --no-install
```

## Templates

| Name | Stack | Use |
|---|---|---|
| `hono-react-cfworker` | Hono Worker + React + Cloudflare Workers | Raft-native operational apps with browser console, Agent Login, OpenAPI, docs, and agent CLI conventions. |

## Generated app

The generated project contains:

- `worker/` — Hono Worker API, Raft Agent Login manifest, `/api/auth/me`,
  generated `/openapi.json`, and `/api-docs`.
- `admin/` — Vite + React admin shell.
- `docs/public/` — public Markdown docs rendered into `admin/public/docs`.
- `AGENTS.md` — repository entry point for AI agents.
- `.github/workflows/ci.yml` — build validation for PRs.

The template is a starting point. Fill in the Raft OAuth exchange and product
domain routes before using it in production.
