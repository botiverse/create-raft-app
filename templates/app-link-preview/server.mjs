// Minimal App-owned link renderer. Run behind HTTPS; no package dependencies.
import { createServer } from 'node:http';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function previewForRequest({ authorization, body, jwks, issuer, clientId, origin, serverId, installationId, allowedViewers, now = Date.now() }) {
  const fail = () => { throw new Error('Preview unavailable'); };
  if (!authorization?.startsWith('Bearer ')) return fail();
  const parts = authorization.slice(7).split('.');
  if (parts.length !== 3) return fail();
  const [encodedHeader, encodedClaims, signature] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url'));
  const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url'));
  if (header.alg !== 'ES256' || header.typ !== 'raft-link-preview+jwt' || typeof header.kid !== 'string' || !header.kid) return fail();
  const key = jwks.keys.find((key) => key.kid === header.kid && key.alg === 'ES256' && key.kty === 'EC' && key.crv === 'P-256' && (key.use === undefined || key.use === 'sig'));
  if (!key || !verify('sha256', Buffer.from(`${encodedHeader}.${encodedClaims}`), { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))) return fail();
  const seconds = Math.floor(now / 1000);
  if (claims.iss !== issuer || claims.aud !== `urn:raft:link-preview:${clientId}` || claims.token_use !== 'link_preview'
    || claims.type !== 'human' || claims.server_id !== serverId || !allowedViewers.has(claims.sub)
    || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || !Number.isFinite(claims.nbf)
    || claims.exp <= seconds || claims.exp > seconds + 35 || claims.iat > seconds + 5 || claims.nbf > seconds + 5 || claims.exp - claims.iat > 30
    || claims.exp <= claims.iat || claims.exp <= claims.nbf
    || typeof installationId !== 'string' || !installationId || claims.installation_id !== installationId
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

export async function fetchJwks(issuer, fetcher = fetch) {
  const trustedIssuer = new URL(issuer);
  if (trustedIssuer.protocol !== 'https:' || trustedIssuer.username || trustedIssuer.password || trustedIssuer.search || trustedIssuer.hash || issuer.endsWith('/')) throw new Error('Invalid issuer');
  const signal = AbortSignal.timeout(1500);
  const discovery = await fetcher(`${issuer}/.well-known/openid-configuration`, { redirect: 'error', signal });
  if (!discovery.ok) throw new Error('Issuer discovery unavailable');
  const config = await discovery.json();
  if (config.issuer !== issuer || typeof config.jwks_uri !== 'string') throw new Error('Issuer discovery mismatch');
  const jwksUrl = new URL(config.jwks_uri);
  if (jwksUrl.origin !== trustedIssuer.origin || jwksUrl.username || jwksUrl.password || jwksUrl.hash) throw new Error('Untrusted JWKS URL');
  const response = await fetcher(jwksUrl.href, { redirect: 'error', signal });
  if (!response.ok) throw new Error('JWKS unavailable');
  return response.json();
}

export function createPreviewServer({ issuer, clientId, origin, serverId, installationId, allowedViewers, getJwks }) {
  if (!issuer || !clientId || !origin || !serverId || !installationId || !(allowedViewers instanceof Set)) throw new Error('Missing preview configuration');
  // Discovery starts only from configured issuer, never an unverified claim.
  const readKeys = getJwks ?? (() => fetchJwks(issuer));
  return createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
    if (req.method === 'GET' && req.url === '/.well-known/raft-link-preview.json') { res.end(JSON.stringify({ client_id: clientId })); return; }
    if (req.method !== 'POST' || req.url !== '/preview') { res.writeHead(404).end('{}'); return; }
    try {
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8192) throw new Error('Too large'); }
      const result = previewForRequest({ authorization: req.headers.authorization, body: JSON.parse(body), jwks: await readKeys(), issuer, clientId, origin, serverId, installationId, allowedViewers });
      res.end(JSON.stringify(result));
    } catch { res.writeHead(404).end('{}'); } // No raw URL, assertion or private data in logs.
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { RAFT_ISSUER: issuer, RAFT_CLIENT_ID: clientId, APP_ORIGIN: origin, RAFT_SERVER_ID: serverId, RAFT_INSTALLATION_ID: installationId, ALLOWED_VIEWER_IDS = '' } = process.env;
  if (!issuer || !clientId || !origin || !serverId || !installationId) throw new Error('Configure RAFT_ISSUER, RAFT_CLIENT_ID, APP_ORIGIN, RAFT_SERVER_ID and RAFT_INSTALLATION_ID');
  const allowedViewers = new Set(ALLOWED_VIEWER_IDS.split(',').filter(Boolean));
  const server = createPreviewServer({ issuer, clientId, origin, serverId, installationId, allowedViewers });
  server.listen(Number(process.env.PORT ?? 8789), '127.0.0.1', () => console.log(`preview example listening on ${server.address().port}`));
}
