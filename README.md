# create-raft-app

Create Raft-native apps from maintained templates.

The default template is `hono-react-cfworker`: a Cloudflare Worker API using
Hono, a React admin frontend, generated OpenAPI, public docs, `AGENTS.md`,
and Raft/Agent Login integration points. The package also includes the base
third-party app templates from `raft-app-templates` for smaller Login with
Raft, local CLI, HTTP action, OAuth action, and dual human/agent starters.

## Usage

Requires Node.js 20.19 or newer, or Node.js 22.12 or newer.

```bash
npm create raft-app@latest my-raft-app
```

Choose a template when prompted, or pass it explicitly:

```bash
npm create raft-app@latest my-raft-app -- --template hono-react-cfworker
```

For non-interactive scaffolding:

```bash
npm create raft-app@latest my-raft-app -- --template hono-react-cfworker --yes
```

Local development from this repo:

```bash
node bin/create-raft-app.mjs my-raft-app --template hono-react-cfworker --no-install
```

To inspect the CLI options:

```bash
npm create raft-app@latest -- --help
```

## Templates

| Name | Stack | Use |
|---|---|---|
| `hono-react-cfworker` | Hono Worker + React + Cloudflare Workers | Raft-native operational apps with browser console, Agent Login, OpenAPI, docs, and agent CLI conventions. |
| `pure-sign-in-web-app` | Express + Login with Raft | User sign-in and userinfo/session only; no message access, actions, or agent-facing payloads. |
| `local-cli-wrapper` | Node local CLI wrapper | Isolate HOME/XDG state and service-owned credential handoff for a local third-party CLI. |
| `hosted-http-action-service` | Express HTTP action service | Manifest-declared hosted actions with public action envelopes and structured errors. |
| `oauth-http-action-service` | Express OAuth + action service | Login with Raft plus service-local agent session and HTTP action endpoint. |
| `hosted-dual-human-agent-app` | Express hosted dual app | Browser human login and direct agent callback sessions in one hosted service. |

## Generated app

The generated project contains:

- `worker/` — Hono Worker API, Raft Agent Login manifest, `/api/auth/me`,
  generated `/openapi.json`, `/api-docs`, and D1/R2/Queue bindings.
- `admin/` — Vite + React admin shell.
- `docs/public/` — public Markdown docs rendered into `admin/public/docs`.
- `AGENTS.md` — repository entry point for AI agents.
- `.github/workflows/ci.yml` — build validation for PRs.

The template is a starting point. Fill in the Raft OAuth exchange and product
domain routes before using it in production.

## Publishing

The package is published as `create-raft-app` on npm. Publishing is handled by
the manual GitHub Actions workflow `.github/workflows/publish-npm.yml`.

Before publishing a new version:

1. Update `package.json`.
2. Run `npm test`.
3. Run the `Publish npm package` workflow with `dry_run=true` and the expected
   version.
4. Re-run the same workflow with `dry_run=false` after the dry run passes.

The publish workflow uses npm trusted publishing through GitHub Actions OIDC, so
it does not require a long-lived npm token secret.
