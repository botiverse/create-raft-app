import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "bin/create-raft-app.mjs"), ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`exit ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

test("scaffolds hono-react-cfworker template with replacements", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "create-raft-app-"));
  try {
    const result = await run(["my-raft-app", "--template", "hono-react-cfworker", "--yes", "--no-install"], tmp);
    assert.match(result.stdout, /Created my-raft-app from hono-react-cfworker/);

    const appRoot = path.join(tmp, "my-raft-app");
    assert.equal(existsSync(path.join(appRoot, "worker/src/index.ts")), true);
    assert.equal(existsSync(path.join(appRoot, "admin/src/App.tsx")), true);
    assert.equal(existsSync(path.join(appRoot, "AGENTS.md")), true);
    assert.equal(existsSync(path.join(appRoot, ".gitignore")), true);

    const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
    assert.equal(packageJson.name, "my-raft-app");
    assert.equal(packageJson.scripts.build, "npm run build:admin && npm run build:worker");

    const agentGuide = await readFile(path.join(appRoot, "docs/public/agent-guide.md"), "utf8");
    assert.match(agentGuide, /export MY_RAFT_APP_BEARER_TOKEN=/);

    const worker = await readFile(path.join(appRoot, "worker/src/index.ts"), "utf8");
    assert.match(worker, /title: "My Raft App API"/);
    assert.doesNotMatch(worker, /__APP_NAME__/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
