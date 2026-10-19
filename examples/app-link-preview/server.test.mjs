import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { previewForRequest } from './server.mjs';
test('sample renderer verifies the callback purpose, identity, resource and body binding', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwks = { keys: [{ ...pair.publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'ES256' }] };
  const body = { version: 1, url: 'https://app.example/pr/123', request_id: 'request-1' };
  const now = Date.now(); const seconds = Math.floor(now / 1000);
  const claims = { iss: 'https://raft.example/oidc/team', aud: 'urn:raft:link-preview:example', sub: 'viewer', type: 'human', token_use: 'link_preview', server_id: 'server', installation_id: 'install', jti: body.request_id, iat: seconds, nbf: seconds, exp: seconds + 30, url_sha256: createHash('sha256').update(body.url).digest('hex') };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (value) => { const input = `${encode({ alg: 'ES256', kid: 'test', typ: 'raft-link-preview+jwt' })}.${encode(value)}`; return `${input}.${sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`; };
  const input = { authorization: `Bearer ${token(claims)}`, body, jwks, issuer: claims.iss, clientId: 'example', origin: 'https://app.example', serverId: 'server', allowedViewers: new Set(['viewer']), now };
  assert.equal(previewForRequest(input).title, 'Example PR 123');
  for (const change of [{ token_use: 'agent_access' }, { aud: 'example' }, { sub: 'another-viewer' }, { exp: seconds - 1 }, { server_id: 'another-server' }, { url_sha256: 'changed' }]) {
    assert.throws(() => previewForRequest({ ...input, authorization: `Bearer ${token({ ...claims, ...change })}` }));
  }
  assert.throws(() => previewForRequest({ ...input, body: { ...body, url: 'https://app.example/pr/456' } }));
});
