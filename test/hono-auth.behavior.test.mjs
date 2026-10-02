import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const exec = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const token = "synthetic-session-token";
const env = {
  RAFT_CLIENT_ID: "fixture-app",
  RAFT_CLIENT_SECRET: "synthetic-test-secret",
  RAFT_API_ORIGIN: "https://raft.example.test",
};
let tempRoot;
let app;

// Exercise the generated Worker's actual Hono routes, not strings in its source.
// Only the remote identity provider is mocked; no live credentials or API calls.
before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "raft-auth-behavior-"));
  await exec(process.execPath, [
    path.join(repoRoot, "bin/create-raft-app.mjs"), "fixture-app",
    "--template", "hono-react-cfworker", "--yes", "--no-install",
  ], { cwd: tempRoot });
  const appRoot = path.join(tempRoot, "fixture-app");
  await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: appRoot, maxBuffer: 4 * 1024 * 1024,
  });
  const ts = createRequire(path.join(appRoot, "package.json"))("typescript");
  const source = await readFile(path.join(appRoot, "worker/src/index.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const compiledPath = path.join(appRoot, "worker/src/auth-test.mjs");
  await writeFile(compiledPath, compiled.outputText);
  app = (await import(pathToFileURL(compiledPath).href)).default;
});

after(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

function identityProvider(t, { clientId = env.RAFT_CLIENT_ID, type = "agent", tokenStatus = 200 } = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === `${env.RAFT_API_ORIGIN}/api/oauth/token`) {
      return Response.json(tokenStatus === 200 ? { access_token: token, expires_in: 3600 } : { error: "rejected" }, { status: tokenStatus });
    }
    assert.equal(url, `${env.RAFT_API_ORIGIN}/api/oauth/userinfo`, "unexpected network request");
    return Response.json({ sub: "fixture-principal", type, client_id: clientId, name: "Fixture", server_slug: "fixture-server" });
  });
  return calls;
}

function sessionCookie(response) {
  // Rejected callbacks may clear the pending-login cookie. They must not mint
  // raft_session, which is the credential that grants application access.
  return response.headers.getSetCookie().find((value) => value.startsWith("raft_session="));
}

const callback = (headers, bindings = env) => app.request(
  "https://app.example.test/login/raft/callback?code=synthetic-code",
  { headers }, bindings,
);

test("another app's token cannot authenticate a bearer request", async (t) => {
  identityProvider(t, { clientId: "another-app" });
  const response = await app.request("https://app.example.test/api/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  }, env);
  assert.equal(response.status, 401);
  assert.equal(sessionCookie(response), undefined);
});

test("another app's token cannot establish a callback session", async (t) => {
  identityProvider(t, { clientId: "another-app" });
  const response = await callback();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "IDENTITY_UNVERIFIED");
  assert.equal(sessionCookie(response), undefined);
});

test("an unconfigured client ID cannot establish a session", async (t) => {
  identityProvider(t);
  const response = await callback(undefined, { ...env, RAFT_CLIENT_ID: undefined });
  assert.equal(response.status, 502);
  assert.equal(sessionCookie(response), undefined);
});

test("a human without pending browser login is rejected before session creation", async (t) => {
  identityProvider(t, { type: "human" });
  const response = await callback();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "LOGIN_STATE_REQUIRED");
  assert.equal(sessionCookie(response), undefined);
});

test("an agent gets a scoped cookie and can use it, without a response-body token", async (t) => {
  identityProvider(t);
  const response = await callback();
  assert.equal(response.status, 200);
  const bodyText = await response.text();
  const body = JSON.parse(bodyText);
  assert.equal(body.ok, true);
  assert.equal(body.account.principal_type, "agent");
  assert.equal(Object.hasOwn(body, "access_token"), false);
  assert.equal(Object.hasOwn(body, "session_token"), false);
  assert.equal(bodyText.includes(token), false);
  const cookie = sessionCookie(response);
  assert.ok(cookie);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; SameSite=Lax/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const me = await app.request("https://app.example.test/api/auth/me", {
    headers: { cookie: cookie.split(";")[0] },
  }, env);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).account.principal_type, "agent");
});

test("a same-app human with pending login still receives a browser session", async (t) => {
  identityProvider(t, { type: "human" });
  const response = await callback({ cookie: "raft_login_pending=synthetic-pending" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/");
  assert.ok(sessionCookie(response));
});

test("expired or consumed codes return 409 without a session or identity lookup", async (t) => {
  const calls = identityProvider(t, { tokenStatus: 400 });
  const response = await callback();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "CODE_EXPIRED_OR_USED");
  assert.equal(sessionCookie(response), undefined);
  assert.deepEqual(calls, [`${env.RAFT_API_ORIGIN}/api/oauth/token`]);
});
