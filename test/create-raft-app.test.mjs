import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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

function run(args, cwd, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "bin/create-raft-app.mjs"), ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
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
    if (input !== undefined) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
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

async function readGeneratedTextFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  const textExtensions = new Set([
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsonc",
    ".md",
    ".mjs",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
  ]);
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readGeneratedTextFiles(entryPath));
    } else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

async function assertNoGeneratedLegacyBranding(appRoot) {
  const legacyBrandPattern = new RegExp("slo" + "ck", "i");
  for (const file of await readGeneratedTextFiles(appRoot)) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, legacyBrandPattern, `${path.relative(appRoot, file)} should use Raft branding`);
  }
}

test("lists every packaged template", async () => {
  const result = await run(["--list-templates"], repoRoot);
  assert.match(result.stdout, /^Available templates:/m);
  for (const templateName of templateNames) {
    assert.match(result.stdout, new RegExp(`^\\d+\\. ${templateName} - `, "m"));
  }
});

test("lists templates as machine-readable JSON", async () => {
  const result = await run(["--list-templates", "--json"], repoRoot);
  const body = JSON.parse(result.stdout);
  assert.equal(body.schemaVersion, "create-raft-app.templates.v1");
  assert.equal(body.defaultTemplate, "hono-react-cfworker");
  assert.deepEqual(body.templates.map((template) => template.name), templateNames);
  for (const template of body.templates) {
    assert.equal(typeof template.label, "string");
    assert.equal(typeof template.description, "string");
    assert.equal(Array.isArray(template.agentHandoff.files), true);
    assert.equal(Array.isArray(template.agentHandoff.commands), true);
    assert.equal(Array.isArray(template.agentHandoff.env), true);
    assert.equal(Array.isArray(template.agentHandoff.urls), true);
    assert.equal(Array.isArray(template.agentHandoff.registration), true);
  }
});

test("test template list matches packaged template directories", async () => {
  const dirs = await readdir(path.join(repoRoot, "templates"), { withFileTypes: true });
  const packagedTemplateNames = dirs
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual([...templateNames].sort(), packagedTemplateNames);
});

test("help documents template listing and default", async () => {
  const result = await run(["--help"], repoRoot);
  assert.match(result.stdout, /--list-templates\s+Print available templates/);
  assert.match(result.stdout, /Default template: hono-react-cfworker/);
});

test("unknown template error lists available templates", async () => {
  await assert.rejects(
    () => run(["bad-app", "--template", "missing-template", "--yes", "--no-install"], repoRoot),
    /Unknown template 'missing-template'.*hono-react-cfworker.*hosted-dual-human-agent-app/s,
  );
});

test("interactive template prompt defaults to hono-react-cfworker", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "create-raft-app-"));
  try {
    const result = await run(["interactive-app", "--no-install"], tmp, "\n");
    assert.match(result.stdout, /Template name or number \[hono-react-cfworker\]:/);
    assert.match(result.stdout, /Created interactive-app from hono-react-cfworker/);
    const descriptor = JSON.parse(await readFile(path.join(tmp, "interactive-app/raft-template.json"), "utf8"));
    assert.equal(descriptor.id, "hono-react-cfworker");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("scaffold JSON result is stable and template-specific", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "create-raft-app-"));
  try {
    const result = await run(
      ["json-app", "--template", "hosted-dual-human-agent-app", "--yes", "--no-install", "--json"],
      tmp,
    );
    const body = JSON.parse(result.stdout);
    assert.equal(body.schemaVersion, "create-raft-app.scaffold-result.v1");
    assert.equal(body.projectName, "json-app");
    assert.equal(body.packageName, "json-app");
    assert.equal(body.installed, false);
    assert.equal(body.template.name, "hosted-dual-human-agent-app");
    assert.equal(body.nextSteps.agentHandoffFiles.includes("AGENTS.md"), true);
    assert.equal(body.nextSteps.env.includes("RAFT_CLIENT_ID"), true);
    assert.equal(
      body.nextSteps.urls.some((item) => item.url === "http://localhost:4174/.well-known/raft-agent-manifest.json"),
      true,
    );
    assert.equal(existsSync(path.join(tmp, "json-app/AGENTS.md")), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
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
    // Working Login-with-Raft: verifies tokens via userinfo, uses the correct
    // return_to param (not redirect_uri), and exchanges the code for a token.
    assert.match(worker, /api\/oauth\/userinfo/);
    assert.match(worker, /return_to/);
    assert.doesNotMatch(worker, /redirect_uri/);
    assert.match(worker, /access_token/);
    assert.match(worker, /return authNotConfigured\(c\)/);
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
      assert.equal(existsSync(path.join(appRoot, "AGENTS.md")), true);
      assert.equal(existsSync(path.join(appRoot, "README.md")), true);
      assert.equal(existsSync(path.join(appRoot, "raft-template.json")), true);

      const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
      assert.equal(packageJson.name, projectName);
      assert.equal(typeof packageJson.scripts?.build, "string");

      const descriptor = JSON.parse(await readFile(path.join(appRoot, "raft-template.json"), "utf8"));
      assert.equal(descriptor.id, templateName);
      const agentGuide = await readFile(path.join(appRoot, "AGENTS.md"), "utf8");
      assert.match(agentGuide, new RegExp(templateName));
      await assertNoGeneratedLegacyBranding(appRoot);

      await npm(["install", "--ignore-scripts"], appRoot);
      await npm(["run", "build"], appRoot);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
}
