# OAuth + HTTP Action Service

Minimal hosted service that combines Login with Raft, Agent Login-style callback handling, and manifest-declared HTTP actions.

This fixture is for third-party apps that need Raft OAuth identity plus an agent-callable action endpoint. It keeps Raft tokens inside the service boundary and returns only service-local sessions or public action envelopes.

## What It Demonstrates

- Human Login with Raft using state-bound authorization-code flow.
- Agent callback handoff without browser state.
- Userinfo lookup for principal context.
- Service-local agent session token issuance.
- Bearer-protected HTTP action endpoint.
- Public action envelope responses.
- Local revoke endpoint for the service-local agent session.

## What It Cannot Do

- Read Raft messages.
- Send messages as a human, agent, or bot.
- Return raw Raft access tokens from session/context APIs.
- Generate agent-facing payloads.
- Create third-party custom Raft action cards.

## Setup

1. Copy `.env.example` to `.env`.
2. Register an OAuth client in Raft with both redirect URIs:
   - `http://localhost:4182/auth/callback`
   - `http://localhost:4182/agent/callback`
3. Fill `RAFT_CLIENT_ID` and `RAFT_CLIENT_SECRET`.
4. Keep the Raft web setup origin separate from the API origin:
   - `RAFT_APP_ORIGIN` is the browser app that serves the setup page.
   - `RAFT_SETUP_PATH` is the setup route; `/login-with-raft/setup` is the Raft-branded route.
   - `RAFT_API_ORIGIN` is the API origin used for token and userinfo calls.
5. Run:

```bash
npm install
npm start
```

Open <http://localhost:4182>.

For agent-login smoke testing, complete the Raft-side handoff to obtain an authorization code, then call:

```bash
curl -sS 'http://localhost:4182/agent/callback?code=CODE_FROM_RAFT'
```

Use the returned `agentSessionToken` for action calls:

```bash
curl -sS http://localhost:4182/actions/create-demo-record \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer SERVICE_LOCAL_AGENT_SESSION' \
  --data '{"title":"Demo record"}'
```

## Manifest Notes

See `manifest.example.json`. The manifest declares OAuth, Agent Login-style callback handling, and one action endpoint. The action returns a public envelope and is not a custom Raft action card.

Browser login redirects through the Raft setup page and returns to this app's callback. Token exchange and userinfo use the public API routes `/api/oauth/token` and `/api/oauth/userinfo`; local session/context responses must not expose the raw Raft access token.

The fixture uses HTTP Basic auth for token exchange by default because current Raft accepts it and standard OAuth libraries handle it better. Current Raft also accepts `clientId` / `clientSecret` form fields as a non-standard body fallback; generic OAuth clients often use `client_id` / `client_secret`, so do not rely on body credentials without checking the platform contract.

`agentLogin.revoke` documents the service-local session revoke endpoint. Raft does not gain implicit revoke authority from the manifest alone; the service still validates the service-local agent session token.

## Production Notes

`agentSessions` is an in-memory fixture store. Production apps should persist service-local sessions, bind them to app/user/agent identity, set expiry, and clear them when the Raft grant or app install is revoked. Do not expose the raw Raft access token in the persisted session or any agent-visible response.

## Production Checklist

- Register both human and agent callback URLs for the deployed origin.
- Persist service-local agent sessions with expiry and revoke handling.
- Keep raw Raft access and refresh tokens server-side only.
- Validate action inputs, return public envelopes, and audit write-like actions.
- Re-check scopes and marketplace review state before exposing the action service publicly.
