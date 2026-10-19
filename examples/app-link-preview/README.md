# Example link renderer

This synthetic App renders `/pr/<number>` links for an explicit viewer allowlist.
It is a complete callback example, not an integration with real PR data.

This standalone callback example is not a packaged `--template` option.

Run with Node 24+, behind your HTTPS reverse proxy on a domain you control:

```sh
RAFT_ISSUER=https://api.raft.build/oidc/YOUR_SERVER_SLUG \
RAFT_CLIENT_ID=your-client-key \
RAFT_SERVER_ID=your-server-uuid \
APP_ORIGIN=https://your-app.example \
ALLOWED_VIEWER_IDS=your-test-human-uuid \
node examples/app-link-preview/server.mjs
```

The local process listens on `127.0.0.1:8789` (`PORT` can override). It serves the
well-known domain proof and `/preview` callback. Register the origin and callback
using your App backend credentials as described in
[the complete guide](https://docs.raft.build/developers/raft-apps/link-previews/). Keep credentials out
of shell history and source control. The callback itself needs no client secret.

Install the App on your test Server, sign in to it with Login with Raft as the
allowlisted human, and post a synthetic `https://your-app.example/pr/123` link.
The callback verifies the platform assertion and checks the allowlist before
returning the example card. Real Apps must check each linked resource's ACL too.
Never use the assertion as an API access token or let the unverified issuer select
a JWKS URL. The example fetches JWKS only from the fixed configured issuer.

Run the local assertion/ACL regression with:

```sh
node --test examples/app-link-preview/server.test.mjs
```
