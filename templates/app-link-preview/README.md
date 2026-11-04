# __APP_NAME__

This is a synthetic App-owned link preview callback generated with
`__TEMPLATE_NAME__`. It renders example `/pr/<number>` links for an explicit
viewer allowlist. It does not connect to a real PR service or include Login with
Raft. It is configured for one Server and installation; a multi-Server App must
look up the correct active installation and resource permissions itself. Use
your own resource authorization before returning private data.

## Run locally

Requires Node 24 or newer. Set the public configuration values in your local
environment, then run `npm start`:

```sh
RAFT_ISSUER=https://raft.example/oidc/YOUR_SERVER_SLUG \
RAFT_CLIENT_ID=your-client-key \
RAFT_SERVER_ID=your-server-uuid \
RAFT_INSTALLATION_ID=your-installation-uuid \
APP_ORIGIN=https://your-app.example \
ALLOWED_VIEWER_IDS=your-test-human-uuid \
npm start
```

Replace these placeholders with the registered App and Server's values; the
issuer must be the Server-scoped HTTPS issuer documented by your Raft provider.
The App backend can find its installation ID for that Server through the
[installation lookup](https://docs.raft.build/developers/raft-apps/bot/).

The server listens on `127.0.0.1:8789` (`PORT` overrides it). It provides
`/.well-known/raft-link-preview.json` and `/preview`; a public HTTPS reverse
proxy on a domain you control is needed for registration. The callback does not
need an App client secret. Registration uses backend-only client credentials:
see the [App link previews guide](https://docs.raft.build/developers/raft-apps/link-previews/).

Run `npm test` for local synthetic assertion and viewer-access tests. A valid
assertion establishes a viewer, App, Server, installation, URL and request,
not the viewer's right to a private resource. Replace the allowlist and synthetic
card with your product's current per-resource access check; test an authorized
and unauthorized viewer, a revoked login and an uninstalled App. Do not use
preview assertions as API tokens or log assertions or raw private URLs. Support
depends on the target Raft environment and on the App and viewer meeting the
guide's installation and login requirements.
