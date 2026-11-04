import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const exec = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const nativeFetch = globalThis.fetch;
let tempRoot, server, appOrigin;
let calls = [];
let providerIdentity = { sub: "synthetic-user", type: "human", client_id: "fixture-app", server_id: "fixture-server" };

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "raft-dual-auth-"));
  await exec(process.execPath, [path.join(repoRoot, "bin/create-raft-app.mjs"), "fixture-app", "--template", "hosted-dual-human-agent-app", "--yes", "--no-install"], { cwd: tempRoot });
  const root = path.join(tempRoot, "fixture-app");
  await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  Object.assign(process.env, {
    RAFT_CLIENT_ID: "fixture-app", RAFT_CLIENT_SECRET: "synthetic-secret",
    RAFT_API_ORIGIN: "https://raft.example.test", APP_ORIGIN: "https://app.example.test",
    SESSION_SECRET: "synthetic-session-secret",
  });
  const { app } = await import(pathToFileURL(path.join(root, "src/server.js")).href);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  appOrigin = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://raft.example.test/")) {
      calls.push(url);
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
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

async function begin() {
  const login = await fetch(`${appOrigin}/login`, { redirect: "manual" });
  const state = new URL(login.headers.get("location")).searchParams.get("state");
  const cookies = login.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  assert.ok(state);
  assert.ok(cookies);
  return { state, cookies };
}

test("browser state mismatch and missing cookie are rejected before exchange", async () => {
  calls = [];
  const { state, cookies } = await begin();
  const mismatch = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=other`, { headers: { cookie: cookies }, redirect: "manual" });
  assert.equal(mismatch.status, 400);
  const noCookie = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=${state}`, { redirect: "manual" });
  assert.equal(noCookie.status, 400);
  assert.deepEqual(calls, []);
});

test("a matching browser callback succeeds only for the configured client", async () => {
  calls = [];
  providerIdentity = { sub: "synthetic-user", type: "human", client_id: "fixture-app", server_id: "fixture-server" };
  const { state, cookies } = await begin();
  const response = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=${state}`, { headers: { cookie: cookies }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/");
  assert.equal(calls.length, 2);
  providerIdentity = { sub: "synthetic-user", type: "human", server_id: "fixture-server" };
  const second = await begin();
  const missingClient = await fetch(`${appOrigin}/auth/raft/callback?code=fixture&state=${second.state}`, { headers: { cookie: second.cookies }, redirect: "manual" });
  assert.equal(missingClient.status, 403);
});
