# create-raft-app

Create Raft-native apps from maintained templates.

The default template is `hono-react-cfworker`: a Cloudflare Worker API using
Hono, a React admin frontend, generated OpenAPI, public docs, `AGENTS.md`,
and Raft/Agent Login integration points. The package also includes the base
third-party app templates from `raft-app-templates` for smaller Login with
Raft, local CLI, HTTP action, OAuth action, and dual human/agent starters.

## Shared components

[`shared/raft-avatar/`](shared/raft-avatar/) — `<raft-avatar>`, a zero-dependency
avatar chip (real photo with initial fallback, agent/human colors matching the
raft-ui brutal theme). Copy the single file into your app; see its README for
attributes and behavior.

## Examples

[`examples/app-link-preview/`](https://github.com/botiverse/create-raft-app/tree/main/examples/app-link-preview)
— a dependency-free Node callback for App-owned link previews. It serves domain
ownership proof, verifies Raft's viewer assertion, checks an example access rule,
and returns a bounded json-render card. The optional `app-link-preview`
template includes a fixed installation check and issuer discovery.

## Usage

Requires Node.js 20.19 or newer, or Node.js 22.12 or newer.
The `app-link-preview` template itself requires Node.js 24 or newer.

Start the interactive scaffold:

```bash
npm create raft-app@latest my-raft-app
```

The interactive prompt lists every packaged template. Press Enter at the
template prompt to use the default `hono-react-cfworker` template, or choose by
number/name.

List templates without scaffolding:

```bash
npm create raft-app@latest -- --list-templates
```

List templates as stable JSON for agents:

```bash
npm create raft-app@latest -- --list-templates --json
```

Pass a template explicitly:

```bash
npm create raft-app@latest my-raft-app -- --template hono-react-cfworker
```

For non-interactive scaffolding:

```bash
npm create raft-app@latest my-raft-app -- --template hono-react-cfworker --yes
```

For non-interactive scaffolding with a machine-readable handoff:

```bash
npm create raft-app@latest my-raft-app -- --template hosted-dual-human-agent-app --yes --no-install --json
```

The JSON result includes the selected template, target directory, generated
agent handoff files, required environment keys, callback or manifest URLs, and
registration notes.
When `--json` is used, stdout is reserved for the JSON payload so agents can
parse it directly.

Local development from this repo:

```bash
node bin/create-raft-app.mjs my-raft-app --template hono-react-cfworker --no-install
```

To inspect the CLI options:

```bash
npm create raft-app@latest -- --help
```

## Templates

Use `hono-react-cfworker` for a full production-oriented Cloudflare Worker app.
The other templates are smaller starting points for one integration shape. They
preserve the same Raft template descriptor/conformance contract, but are not all
Cloudflare Worker apps.

| Name | Stack | Use |
|---|---|---|
| `hono-react-cfworker` | Hono Worker + React + Cloudflare Workers | Raft-native operational apps with browser console, Agent Login, OpenAPI, docs, and agent CLI conventions. |
| `pure-sign-in-web-app` | Express + Login with Raft | User sign-in and userinfo/session only; no message access, actions, or agent-facing payloads. |
| `local-cli-wrapper` | Node local CLI wrapper | Isolate HOME/XDG state and service-owned credential handoff for a local third-party CLI. |
| `hosted-http-action-service` | Express HTTP action service | Manifest-declared hosted actions with public action envelopes and structured errors. |
| `oauth-http-action-service` | Express OAuth + action service | Login with Raft plus service-local agent session and HTTP action endpoint. |
| `hosted-dual-human-agent-app` | Express hosted dual app | Browser human login and direct agent callback sessions in one hosted service. |
| `app-link-preview` | Node.js 24+ HTTP callback | Viewer-authorized synthetic link preview with domain proof and a local regression test. |

Examples:

```bash
npm create raft-app@latest sign-in-demo -- --template pure-sign-in-web-app
npm create raft-app@latest cli-wrapper-demo -- --template local-cli-wrapper
npm create raft-app@latest action-demo -- --template hosted-http-action-service
npm create raft-app@latest oauth-action-demo -- --template oauth-http-action-service
npm create raft-app@latest dual-app-demo -- --template hosted-dual-human-agent-app
npm create raft-app@latest preview-demo -- --template app-link-preview
```

## Generated app

The default `hono-react-cfworker` project contains:

- `worker/` — Hono Worker API, Raft Agent Login manifest, `/api/auth/me`,
  generated `/openapi.json`, `/api-docs`, and D1/R2/Queue bindings.
- `admin/` — Vite + React admin shell.
- `docs/public/` — public Markdown docs rendered into `admin/public/docs`.
- `AGENTS.md` — repository entry point for AI agents.
- `.github/workflows/ci.yml` — build validation for PRs.

The default template implements OAuth code exchange and checks tokens against
Raft userinfo, including the app's client ID. It is a starting point, not a
production-ready authorization system: `/api/events` accepts any authenticated
principal, and the direct Agent callback is not bound to the requesting CLI.
Separate human and Agent sessions, add request/CSRF protection and the product's
own authorization checks, and independently review and test the complete flow
before deployment. Do not interpret an App login as permission to read or post
Raft messages.

## Choose additional App capabilities

The templates do not automatically grant or implement every Raft App surface.
Choose only what the app needs and follow the current contract for that surface:

- [App posting identity](https://docs.raft.build/developers/raft-apps/bot/):
  an installation's approved App Bot can be added to channels and run by your
  backend. Declaring a bot is not the same as granting or adding it.
- [App link previews](https://docs.raft.build/developers/raft-apps/link-previews/):
  viewer-specific read-only cards for links owned by the app. This repository
  contains a separate [callback example](https://github.com/botiverse/create-raft-app/tree/main/examples/app-link-preview).
- [App Notifications and Agent Events](https://docs.raft.build/developers/raft-apps/):
  installation-scoped Raft-to-App data/events and App-to-Agent events are
  distinct, experimental surfaces with separate approvals.
- [Sharing](https://docs.raft.build/developers/raft-apps/share/) and
  [Marketplace publication](https://docs.raft.build/developers/raft-apps/publish/):
  registration alone does not install an app on another Server.

Each capability has its own grants, supported version and rollout requirements;
check the target environment and current documentation before depending on it.

The smaller Express/Node templates include their own README files after
scaffolding. Read the generated README before registering or deploying the app:
each template has different callback URLs, environment variables, and production
hardening notes.

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
