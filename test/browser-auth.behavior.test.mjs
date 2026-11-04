import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const exec = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const nativeFetch = globalThis.fetch;

for (const template of ["pure-sign-in-web-app", "oauth-http-action-service"]) {
  test(`${template}: a missing or mismatched state cannot establish a browser session`, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "raft-browser-auth-"));
    let server;
    let calls = [];
    let providerIdentity = { sub: "synthetic-user", type: "human", client_id: "fixture-app", server_id: "synthetic-server" };
    try {
      await exec(process.execPath, [path.join(repoRoot, "bin/create-raft-app.mjs"), "fixture-app", "--template", template, "--yes", "--no-install"], { cwd: temp });
      const root = path.join(temp, "fixture-app");
      await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
      Object.assign(process.env, { RAFT_CLIENT_ID: "fixture-app", RAFT_CLIENT_SECRET: "synthetic-secret", RAFT_API_ORIGIN: "https://raft.example.test", APP_ORIGIN: "https://app.example.test", SESSION_SECRET: "synthetic-session-secret" });
      const { app } = await import(pathToFileURL(path.join(root, "src/server.js")).href);
      await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
      const base = `http://127.0.0.1:${server.address().port}`;
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
      const noState = await fetch(`${base}/auth/callback?code=fixture`, { redirect: "manual" });
      assert.equal(noState.status, 400);
      const login = await fetch(`${base}/auth/login`, { redirect: "manual" });
      const state = new URL(login.headers.get("location")).searchParams.get("state");
      const cookie = login.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
      assert.ok(state);
      assert.ok(cookie);
      const mismatch = await fetch(`${base}/auth/callback?code=fixture&state=other`, { redirect: "manual", headers: { cookie } });
      assert.equal(mismatch.status, 400);
      assert.deepEqual(calls, []);
      const valid = await fetch(`${base}/auth/callback?code=fixture&state=${state}`, { redirect: "manual", headers: { cookie } });
      assert.equal(valid.status, 302);
      assert.equal(calls.length, 2);
      if (template === "oauth-http-action-service") {
        const human = await fetch(`${base}/agent/callback?code=fixture`, { redirect: "manual" });
        assert.equal(human.status, 403);
        assert.equal((await human.json()).error.code, "IDENTITY_UNVERIFIED");
        providerIdentity = { sub: "synthetic-agent", type: "agent", client_id: "other-app", server_id: "synthetic-server" };
        const foreign = await fetch(`${base}/agent/callback?code=fixture`, { redirect: "manual" });
        assert.equal(foreign.status, 403);
        providerIdentity = { sub: "synthetic-agent", type: "agent", client_id: "fixture-app", server_id: "synthetic-server", email: "private@example.test" };
        const agent = await fetch(`${base}/agent/callback?code=fixture`, { redirect: "manual" });
        assert.equal(agent.status, 200);
        const body = await agent.json();
        assert.deepEqual(body.principal, { sub: "synthetic-agent", type: "agent", server_id: "synthetic-server" });
        assert.equal(Object.hasOwn(body.principal, "email"), false);
      }
    } finally {
      globalThis.fetch = nativeFetch;
      if (server) await new Promise((resolve) => server.close(resolve));
      await rm(temp, { recursive: true, force: true });
    }
  });
}
