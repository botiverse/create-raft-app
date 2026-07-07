# Pure Sign-In Web App

Minimal Login with Raft web app. It signs a human in through the Raft setup page, exchanges the OAuth authorization code, calls `/api/oauth/userinfo`, and stores a local demo session.

This fixture is intentionally small and intentionally negative: it does not read messages, send as a human or agent, expose manifest actions, generate agent-facing payloads, or create custom Raft action cards.

## What It Demonstrates

- Login with Raft authorization-code flow.
- Userinfo lookup.
- Local app session.
- Public scopes: `openid profile identity`.

## What It Cannot Do

- Read messages.
- Send messages.
- Act as an agent.
- Define manifest actions.
- Generate agent-facing payloads.
- Create third-party custom Raft action cards.

## Setup

1. Copy `.env.example` to `.env`.
2. Register an OAuth client in Raft with redirect URI `http://localhost:4173/auth/callback`.
3. Fill `RAFT_CLIENT_ID` and `RAFT_CLIENT_SECRET`.
4. Run:

```bash
npm install
npm start
```

Open <http://localhost:4173>.

## Endpoint Shape

- Browser login starts at `${RAFT_APP_ORIGIN}${RAFT_SETUP_PATH}?client_id=...&return_to=...`.
- Token exchange calls `${RAFT_API_ORIGIN}/api/oauth/token` with HTTP Basic client authentication.
- Userinfo calls `${RAFT_API_ORIGIN}/api/oauth/userinfo`.

Keep app/setup origin and API origin separate: the hosted setup page is a human browser surface, while token and userinfo are API surfaces.

Raft currently also accepts `clientId` / `clientSecret` body fields as a server fallback. New fixtures should prefer Basic auth because it is the least surprising path for OAuth libraries and avoids relying on Raft-specific body field names.

## Registration Descriptor

See `raft-app-init.json` for the registration inputs this fixture expects. It is intended to feed `raft integration app prepare register|update`, where an agent prepares a sanitized draft and an owner/admin commits it through an action card. It is not a live server-create API and it must not expose generated secrets in the template repo.

## Manifest Notes

See `manifest.example.json`. The manifest advertises sign-in only and uses no action surface.

`src/adapter.js` exposes the same capability set for conformance and docs. It is not an authority source.

## Checklists

- `../../product-checklists/metadata.md`
- `../../product-checklists/install-models.md`
- `../../product-checklists/review-lifecycle.md`
- `../../contract/compatibility-matrix.md`
