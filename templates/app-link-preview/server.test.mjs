import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createPreviewServer, fetchJwks, previewForRequest } from './server.mjs';
test('sample renderer verifies the callback purpose, identity, resource and body binding', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwks = { keys: [{ ...pair.publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'ES256' }] };
  const body = { version: 1, url: 'https://app.example/pr/123', request_id: 'request-1' };
  const now = Date.now(); const seconds = Math.floor(now / 1000);
  const claims = { iss: 'https://raft.example/oidc/team', aud: 'urn:raft:link-preview:example', sub: 'viewer', type: 'human', token_use: 'link_preview', server_id: 'server', installation_id: 'install', jti: body.request_id, iat: seconds, nbf: seconds, exp: seconds + 30, url_sha256: createHash('sha256').update(body.url).digest('hex') };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (value) => { const input = `${encode({ alg: 'ES256', kid: 'test', typ: 'raft-link-preview+jwt' })}.${encode(value)}`; return `${input}.${sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`; };
  const input = { authorization: `Bearer ${token(claims)}`, body, jwks, issuer: claims.iss, clientId: 'example', origin: 'https://app.example', serverId: 'server', installationId: 'install', allowedViewers: new Set(['viewer']), now };
  assert.equal(previewForRequest(input).title, 'Example PR 123');
  for (const change of [{ token_use: 'agent_access' }, { type: 'agent' }, { aud: 'example' }, { sub: 'another-viewer' }, { exp: seconds }, { iat: seconds + 60 }, { nbf: seconds + 60 }, { iat: seconds + 1, exp: seconds + 1 }, { nbf: seconds + 1, exp: seconds + 1 }, { jti: 'another-request' }, { iss: 'https://another.example' }, { server_id: 'another-server' }, { installation_id: 'another-install' }, { url_sha256: 'changed' }]) {
    assert.throws(() => previewForRequest({ ...input, authorization: `Bearer ${token({ ...claims, ...change })}` }));
  }
  assert.throws(() => previewForRequest({ ...input, body: { ...body, url: 'https://app.example/pr/456' } }));
  assert.throws(() => previewForRequest({ ...input, installationId: undefined }));
});

test('HTTP callback serves proof and fails closed for a foreign installation', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwks = { keys: [{ ...pair.publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'ES256' }] };
  const issuer = 'https://raft.example/oidc/team';
  const body = { version: 1, url: 'https://app.example/pr/123', request_id: 'request-1' };
  const seconds = Math.floor(Date.now() / 1000);
  const claims = { iss: issuer, aud: 'urn:raft:link-preview:example', sub: 'viewer', type: 'human', token_use: 'link_preview', server_id: 'server', installation_id: 'install', jti: body.request_id, iat: seconds, nbf: seconds, exp: seconds + 30, url_sha256: createHash('sha256').update(body.url).digest('hex') };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (value) => { const input = `${encode({ alg: 'ES256', kid: 'test', typ: 'raft-link-preview+jwt' })}.${encode(value)}`; return `${input}.${sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`; };
  const server = createPreviewServer({ issuer, clientId: 'example', origin: 'https://app.example', serverId: 'server', installationId: 'install', allowedViewers: new Set(['viewer']), getJwks: async () => jwks });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const proof = await fetch(`${base}/.well-known/raft-link-preview.json`);
    assert.deepEqual(await proof.json(), { client_id: 'example' });
    const call = (value) => fetch(`${base}/preview`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token(value)}` }, body: JSON.stringify(body) });
    const valid = await call(claims);
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).title, 'Example PR 123');
    const foreign = await call({ ...claims, installation_id: 'another-install' });
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), {});
    assert.equal(foreign.headers.get('cache-control'), 'no-store');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('issuer discovery pins the issuer and refuses a foreign JWKS origin', async () => {
  const issuer = 'https://raft.example/oidc/team';
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, redirect: options.redirect, signal: options.signal });
    if (calls.length === 1) return Response.json({ issuer, jwks_uri: 'https://raft.example/oidc/team/api/oauth/jwks' });
    return Response.json({ keys: [] });
  };
  assert.deepEqual(await fetchJwks(issuer, fetcher), { keys: [] });
  assert.deepEqual(calls.map((call) => call.url), [`${issuer}/.well-known/openid-configuration`, `${issuer}/api/oauth/jwks`]);
  assert.ok(calls.every((call) => call.redirect === 'error'));
  assert.equal(calls[0].signal, calls[1].signal);
  let fetched = 0;
  await assert.rejects(fetchJwks(issuer, async () => {
    fetched++;
    return Response.json({ issuer, jwks_uri: 'https://other.example/jwks' });
  }));
  assert.equal(fetched, 1);
  await assert.rejects(fetchJwks(issuer, async () => Response.json({ issuer: 'https://other.example', jwks_uri: `${issuer}/api/oauth/jwks` })));
  await assert.rejects(fetchJwks('http://raft.example/oidc/team', fetcher));
});
