// Minimal App-owned link renderer. Run behind HTTPS; no package dependencies.
import { createServer } from 'node:http';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function previewForRequest({ authorization, body, jwks, issuer, clientId, origin, serverId, allowedViewers, now = Date.now() }) {
  const fail = () => { throw new Error('Preview unavailable'); };
  if (!authorization?.startsWith('Bearer ')) return fail();
  const parts = authorization.slice(7).split('.');
  if (parts.length !== 3) return fail();
  const [encodedHeader, encodedClaims, signature] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url'));
  const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url'));
  if (header.alg !== 'ES256' || header.typ !== 'raft-link-preview+jwt') return fail();
  const key = jwks.keys.find((key) => key.kid === header.kid && key.alg === 'ES256');
  if (!key || !verify('sha256', Buffer.from(`${encodedHeader}.${encodedClaims}`), { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))) return fail();
  const seconds = Math.floor(now / 1000);
  if (claims.iss !== issuer || claims.aud !== `urn:raft:link-preview:${clientId}` || claims.token_use !== 'link_preview'
    || claims.type !== 'human' || claims.server_id !== serverId || !allowedViewers.has(claims.sub)
    || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || !Number.isFinite(claims.nbf)
    || claims.exp < seconds || claims.exp > seconds + 35 || claims.iat > seconds + 5 || claims.nbf > seconds + 5 || claims.exp - claims.iat > 30
    || typeof claims.installation_id !== 'string' || !claims.installation_id
    || body.version !== 1 || typeof body.request_id !== 'string' || typeof body.url !== 'string' || claims.jti !== body.request_id
    || claims.url_sha256 !== createHash('sha256').update(body.url).digest('hex')) return fail();
  const url = new URL(body.url);
  if (url.origin !== origin || !/^\/pr\/\d+$/.test(url.pathname)) return fail();
  // Replace this with your own resource lookup AND per-resource access check.
  // A valid Raft assertion proves identity, not access to every App resource.
  return { version: 1, title: `Example PR ${url.pathname.split('/').at(-1)}`, card: {
    root: 'summary', elements: {
      summary: { type: 'Stack', props: {}, children: ['status', 'description'] },
      status: { type: 'Badge', props: { text: 'Open' } },
      description: { type: 'Text', props: { text: 'A synthetic PR visible to this viewer.', tone: 'muted' } },
    },
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { RAFT_ISSUER: issuer, RAFT_CLIENT_ID: clientId, APP_ORIGIN: origin, RAFT_SERVER_ID: serverId, ALLOWED_VIEWER_IDS = '' } = process.env;
  if (!issuer || !clientId || !origin || !serverId) throw new Error('Configure RAFT_ISSUER, RAFT_CLIENT_ID, APP_ORIGIN and RAFT_SERVER_ID');
  const allowedViewers = new Set(ALLOWED_VIEWER_IDS.split(',').filter(Boolean));
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
    if (req.method === 'GET' && req.url === '/.well-known/raft-link-preview.json') { res.end(JSON.stringify({ client_id: clientId })); return; }
    if (req.method !== 'POST' || req.url !== '/preview') { res.writeHead(404).end('{}'); return; }
    try {
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8192) throw new Error('Too large'); }
      // Fixed configured issuer, never a URL supplied by an unverified JWT.
      const response = await fetch(`${issuer}/api/oauth/jwks`, { redirect: 'error', signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error('JWKS unavailable');
      const result = previewForRequest({ authorization: req.headers.authorization, body: JSON.parse(body), jwks: await response.json(), issuer, clientId, origin, serverId, allowedViewers });
      res.end(JSON.stringify(result));
    } catch { res.writeHead(404).end('{}'); } // No raw URL, assertion or private data in logs.
  });
  server.listen(Number(process.env.PORT ?? 8789), '127.0.0.1', () => console.log(`preview example listening on ${server.address().port}`));
}
