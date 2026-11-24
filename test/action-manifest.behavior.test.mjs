import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { validateAgentManifestV0 } from "../conformance/agent-manifest-v0.mjs";

const exec = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

// Each hosted action template serves the same v0 manifest it ships as
// manifest.example.json, with APP_ORIGIN in place of the default local origin.
for (const [template, localOrigin] of [
  ["hosted-http-action-service", "http://localhost:4181"],
  ["oauth-http-action-service", "http://localhost:4182"],
]) {
  test(`${template}: serves its raft-agent-manifest.v0 manifest built from APP_ORIGIN`, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "raft-action-manifest-"));
    let server;
    try {
      await exec(process.execPath, [path.join(repoRoot, "bin/create-raft-app.mjs"), "fixture-app", "--template", template, "--yes", "--no-install"], { cwd: temp });
      const root = path.join(temp, "fixture-app");
      await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
      Object.assign(process.env, { RAFT_CLIENT_ID: "fixture-app", RAFT_CLIENT_SECRET: "synthetic-secret", APP_ORIGIN: "https://app.example.test", SESSION_SECRET: "synthetic-session-secret" });
      const { app } = await import(pathToFileURL(path.join(root, "src/server.js")).href);
      await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
      const response = await fetch(`http://127.0.0.1:${server.address().port}/.well-known/raft-app-manifest.json`);
      assert.equal(response.status, 200);
      const manifest = await response.json();
      assert.deepEqual(validateAgentManifestV0(manifest), []);
      assert.equal(manifest.service, "fixture-app");
      assert.deepEqual(manifest.execution, { mode: "http_api", base_url: "https://app.example.test" });
      const example = JSON.parse(await readFile(path.join(root, "manifest.example.json"), "utf8"));
      assert.deepEqual(validateAgentManifestV0(example), []);
      assert.deepEqual(manifest, JSON.parse(JSON.stringify(example).replaceAll(localOrigin, "https://app.example.test")));
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await rm(temp, { recursive: true, force: true });
    }
  });
}
