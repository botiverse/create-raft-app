import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const templateNames = [
  "hono-react-cfworker",
  "pure-sign-in-web-app",
  "local-cli-wrapper",
  "hosted-http-action-service",
  "oauth-http-action-service",
  "hosted-dual-human-agent-app",
];

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

function npm(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
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
      else reject(new Error(`npm ${args.join(" ")} exit ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

test("lists every packaged template", async () => {
  const result = await run(["--list-templates"], repoRoot);
  for (const templateName of templateNames) {
    assert.match(result.stdout, new RegExp(`^${templateName}\\t`, "m"));
  }
});

test("scaffolds hono-react-cfworker template with replacements", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "create-raft-app-"));
  try {
    const result = await run(["my-raft-app", "--template", "hono-react-cfworker", "--yes", "--no-install"], tmp);
    assert.match(result.stdout, /Created my-raft-app from hono-react-cfworker/);

    const appRoot = path.join(tmp, "my-raft-app");
    assert.equal(existsSync(path.join(appRoot, "worker/src/index.ts")), true);
    assert.equal(existsSync(path.join(appRoot, "worker/wrangler.toml")), true);
    assert.equal(existsSync(path.join(appRoot, "worker/migrations/0001_initial.sql")), true);
    assert.equal(existsSync(path.join(appRoot, "admin/src/App.tsx")), true);
    assert.equal(existsSync(path.join(appRoot, "AGENTS.md")), true);
    assert.equal(existsSync(path.join(appRoot, "raft-template.json")), true);
    assert.equal(existsSync(path.join(appRoot, ".gitignore")), true);

    const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
    assert.equal(packageJson.name, "my-raft-app");
    assert.equal(packageJson.scripts.build, "npm run build:admin && npm run build:worker");

    const agentGuide = await readFile(path.join(appRoot, "docs/public/agent-guide.md"), "utf8");
    assert.match(agentGuide, /export MY_RAFT_APP_BEARER_TOKEN=/);
    assert.match(agentGuide, /raft-agent-manifest\.v0/);
    assert.match(agentGuide, /Never accept arbitrary non-empty Bearer strings as authenticated/);

    const descriptor = JSON.parse(await readFile(path.join(appRoot, "raft-template.json"), "utf8"));
    assert.equal(descriptor.id, "hono-react-cfworker");
    assert.equal(descriptor.kind, "hosted-dual-human-agent-app");
    assert.equal(descriptor.status, "v0");
    assert.equal(descriptor.capabilities.includes("agent_login.direct_callback"), true);
    assert.equal(descriptor.negativeCapabilities.includes("messages.read"), true);
    assert.equal(descriptor.authoritySources.includes("runtime-permission"), true);

    const wrangler = await readFile(path.join(appRoot, "worker/wrangler.toml"), "utf8");
    assert.match(wrangler, /name = "my-raft-app"/);
    assert.match(wrangler, /bucket_name = "my-raft-app-files"/);
    assert.match(wrangler, /queue = "my-raft-app-events"/);
    assert.doesNotMatch(wrangler, /__PACKAGE_NAME__/);

    const worker = await readFile(path.join(appRoot, "worker/src/index.ts"), "utf8");
    assert.match(worker, /title: "My Raft App API"/);
    assert.match(worker, /path: "\/api\/events"/);
    assert.match(worker, /schema: "raft-agent-manifest\.v0"/);
    assert.match(worker, /"\/\.well-known\/raft-agent-manifest\.json"/);
    assert.match(worker, /"\/login-with-raft\/setup"/);
    assert.match(worker, /resolvePrincipal/);
    assert.match(worker, /protected API routes fail closed/);
    assert.match(worker, /return authNotConfigured\(c\)/);
    assert.doesNotMatch(worker, /access_token/);
    assert.doesNotMatch(worker, /replace-with-real-token-exchange/);
    assert.doesNotMatch(worker, new RegExp("slo" + "ck", "i"));
    assert.doesNotMatch(worker, /__APP_NAME__/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

for (const templateName of templateNames) {
  test(`scaffolds and builds ${templateName}`, async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "create-raft-app-"));
    try {
      const projectName = `my-${templateName}`;
      const result = await run([projectName, "--template", templateName, "--yes", "--no-install"], tmp);
      assert.match(result.stdout, new RegExp(`Created ${projectName} from ${templateName}`));

      const appRoot = path.join(tmp, projectName);
      assert.equal(existsSync(path.join(appRoot, "README.md")), true);
      assert.equal(existsSync(path.join(appRoot, "raft-template.json")), true);

      const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
      assert.equal(packageJson.name, projectName);
      assert.equal(typeof packageJson.scripts?.build, "string");

      const descriptor = JSON.parse(await readFile(path.join(appRoot, "raft-template.json"), "utf8"));
      assert.equal(descriptor.id, templateName);

      await npm(["install", "--ignore-scripts"], appRoot);
      await npm(["run", "build"], appRoot);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
}
