import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const exec = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const nativeFetch = globalThis.fetch;
let tempRoot, appRoot, server, appOrigin, redirector, redirectorOrigin;
let calls = [];
let redirectInits = [];
let redirectTargetHits = 0;
// APP_ORIGIN is https, so the app only sets its Secure session cookie on a
// request it knows was HTTPS: here, via a TLS-terminating proxy's header.
const viaHttpsProxy = { "x-forwarded-proto": "https" };
let providerIdentity = { sub: "synthetic-user", type: "human", client_id: "fixture-app", server_id: "fixture-server" };

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "raft-dual-auth-"));
  await exec(process.execPath, [path.join(repoRoot, "bin/create-raft-app.mjs"), "fixture-app", "--template", "hosted-dual-human-agent-app", "--yes", "--no-install"], { cwd: tempRoot });
  const root = path.join(tempRoot, "fixture-app");
  appRoot = root;
  await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  Object.assign(process.env, {
    RAFT_CLIENT_ID: "fixture-app", RAFT_CLIENT_SECRET: "synthetic-secret",
    RAFT_API_ORIGIN: "https://raft.example.test", APP_ORIGIN: "https://app.example.test",
    SESSION_SECRET: "synthetic-session-secret",
  });
  const { app } = await import(pathToFileURL(path.join(root, "src/server.js")).href);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  appOrigin = `http://127.0.0.1:${server.address().port}`;
  // A real HTTP hop that redirects the token exchange elsewhere. The target
  // would hand out a token, so a followed redirect would complete the login.
  redirector = createServer((req, res) => {
    if (req.url === "/elsewhere") {
      redirectTargetHits += 1;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: "redirected-token" }));
      return;
    }
    res.writeHead(307, { location: "/elsewhere" }).end();
  });
  await new Promise((resolve) => { redirector.listen(0, "127.0.0.1", resolve); });
  redirectorOrigin = `http://127.0.0.1:${redirector.address().port}`;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://raft.example.test/")) {
      calls.push(url);
      redirectInits.push(init?.redirect);
      const code = typeof init?.body === "string" ? JSON.parse(init.body).code : undefined;
      if (url.endsWith("/api/oauth/token") && code === "used") {
        return Response.json({ error: "invalid_grant", error_description: "The authorization code is invalid, expired, or has already been used" }, { status: 400 });
      }
      if (url.endsWith("/api/oauth/token") && code === "redirected") return nativeFetch(`${redirectorOrigin}/token`, init);
      if (url.endsWith("/api/oauth/token")) return Response.json({ access_token: "synthetic-token" });
      if (url.endsWith("/api/oauth/userinfo")) return Response.json(providerIdentity);
      throw new Error(`unexpected provider request: ${url}`);
    }
    return nativeFetch(input, init);
  };
});

after(async () => {
  globalThis.fetch = nativeFetch;
  if (server) await new Promise((resolve) => server.close(resolve));
  if (redirector) await new Promise((resolve) => redirector.close(resolve));
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

async function begin() {
  const login = await fetch(`${appOrigin}/login`, { headers: viaHttpsProxy, redirect: "manual" });
  const state = new URL(login.headers.get("location")).searchParams.get("state");
  const cookies = login.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  assert.ok(state);
  assert.ok(cookies);
  return { state, cookies };
}

test("browser state mismatch and missing cookie are rejected before exchange", async () => {
  calls = [];
  const { state, cookies } = await begin();
  const mismatch = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=other`, { headers: { ...viaHttpsProxy, cookie: cookies }, redirect: "manual" });
  assert.equal(mismatch.status, 400);
  const noCookie = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=${state}`, { headers: viaHttpsProxy, redirect: "manual" });
  assert.equal(noCookie.status, 400);
  assert.deepEqual(calls, []);
});

test("a matching browser callback succeeds only for the configured client", async () => {
  calls = [];
  providerIdentity = { sub: "synthetic-user", type: "human", client_id: "fixture-app", server_id: "fixture-server" };
  const { state, cookies } = await begin();
  const response = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=${state}`, { headers: { ...viaHttpsProxy, cookie: cookies }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/");
  assert.equal(calls.length, 2);
  providerIdentity = { sub: "synthetic-user", type: "human", server_id: "fixture-server" };
  const second = await begin();
  const missingClient = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=${second.state}`, { headers: { ...viaHttpsProxy, cookie: second.cookies }, redirect: "manual" });
  assert.equal(missingClient.status, 403);
});

test("the agent manifest is raft-agent-manifest.v0 built from APP_ORIGIN", async () => {
  const response = await fetch(`${appOrigin}/.well-known/raft-agent-manifest.json`);
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.schema, "raft-agent-manifest.v0");
  assert.equal(manifest.service, "fixture-app");
  assert.deepEqual(manifest.execution, { mode: "http_api", base_url: "https://app.example.test" });
  assert.deepEqual(manifest.actions.map((action) => action.endpoint), [{ method: "GET", path: "/api/session" }]);
  assert.equal(manifest.http_api, undefined);
  // manifest.example.json is the same manifest with the default local origin.
  const example = JSON.parse(await readFile(path.join(appRoot, "manifest.example.json"), "utf8"));
  assert.deepEqual(
    manifest,
    JSON.parse(JSON.stringify(example).replaceAll("http://localhost:4174", "https://app.example.test")),
  );
});

test("the session cookie is Secure on an HTTPS origin", async () => {
  const login = await fetch(`${appOrigin}/login`, { headers: viaHttpsProxy, redirect: "manual" });
  const setCookies = login.headers.getSetCookie();
  assert.ok(setCookies.length > 0);
  for (const cookie of setCookies) assert.match(cookie, /;\s*secure\b/i, cookie);
});

test("the session cookie omits Secure only for plain-http localhost dev", async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://localhost:4174";
  let local;
  try {
    // A fresh module instance reads the dev APP_ORIGIN.
    const { app } = await import(`${pathToFileURL(path.join(appRoot, "src/server.js")).href}?local-dev`);
    await new Promise((resolve) => { local = app.listen(0, "127.0.0.1", resolve); });
    const login = await fetch(`http://127.0.0.1:${local.address().port}/login`, { redirect: "manual" });
    assert.equal(login.status, 302);
    const setCookies = login.headers.getSetCookie();
    assert.ok(setCookies.length > 0);
    for (const cookie of setCookies) assert.doesNotMatch(cookie, /;\s*secure\b/i, cookie);
  } finally {
    process.env.APP_ORIGIN = previous;
    if (local) await new Promise((resolve) => local.close(resolve));
  }
});

test("calls to Raft never follow redirects", async () => {
  calls = [];
  redirectInits = [];
  redirectTargetHits = 0;
  providerIdentity = { sub: "synthetic-agent", type: "agent", client_id: "fixture-app", server_id: "fixture-server" };
  const redirected = await fetch(`${appOrigin}/auth/raft/callback?code=redirected`, { headers: viaHttpsProxy, redirect: "manual" });
  assert.equal(redirected.status, 502);
  assert.equal(redirectTargetHits, 0);
  assert.equal(redirected.headers.getSetCookie().length, 0);
  const ok = await fetch(`${appOrigin}/auth/raft/callback?code=fixture`, { headers: viaHttpsProxy, redirect: "manual" });
  assert.equal(ok.status, 302);
  assert.equal(calls.length, 3);
  assert.deepEqual(redirectInits, ["manual", "manual", "manual"]);
});

test("an expired or already-used code returns a typed 409 without a session", async () => {
  calls = [];
  providerIdentity = { sub: "synthetic-agent", type: "agent", client_id: "fixture-app", server_id: "fixture-server" };
  const reused = await fetch(`${appOrigin}/auth/raft/callback?code=used`, { headers: viaHttpsProxy, redirect: "manual" });
  assert.equal(reused.status, 409);
  const body = await reused.json();
  assert.equal(body.error, "CODE_EXPIRED_OR_USED");
  assert.equal(typeof body.hint, "string");
  assert.equal(reused.headers.getSetCookie().length, 0);
  // No identity lookup happens for a rejected code.
  assert.deepEqual(calls, ["https://raft.example.test/api/oauth/token"]);
  const { state, cookies } = await begin();
  const browserReuse = await fetch(`${appOrigin}/auth/raft/callback?code=used&state=${state}`, { headers: { ...viaHttpsProxy, cookie: cookies }, redirect: "manual" });
  assert.equal(browserReuse.status, 409);
  assert.equal((await browserReuse.json()).error, "CODE_EXPIRED_OR_USED");
});
