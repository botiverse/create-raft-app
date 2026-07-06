import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const failures = [];

const allowedKinds = new Set([
  "pure-sign-in-web-app",
  "local-cli-wrapper",
  "hosted-http-action-service",
  "oauth-http-action-service",
  "hosted-dual-human-agent-app",
  "private-shared-checklist",
  "bot-app-v1-blocking-checklist",
]);
const allowedStatuses = new Set(["v0", "v1", "future", "unsupported"]);
const allowedAuthoritySources = new Set(["registration", "grant", "scope", "review", "runtime-permission"]);

function fail(message) {
  failures.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${path.relative(root, file)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name));
}

function assertUniqueArray(file, descriptor, key) {
  if (!Array.isArray(descriptor[key])) {
    fail(`${path.relative(root, file)} ${key} must be an array`);
    return;
  }
  const seen = new Set();
  for (const value of descriptor[key]) {
    if (typeof value !== "string" || value.length === 0) {
      fail(`${path.relative(root, file)} ${key} must contain non-empty strings`);
    }
    if (seen.has(value)) {
      fail(`${path.relative(root, file)} ${key} contains duplicate '${value}'`);
    }
    seen.add(value);
  }
}

function validateDescriptor(file) {
  const descriptor = readJson(file);
  if (!descriptor) return null;

  const required = [
    "id",
    "name",
    "kind",
    "status",
    "appType",
    "conversationRole",
    "capabilities",
    "negativeCapabilities",
    "authoritySources",
  ];
  for (const key of required) {
    if (!(key in descriptor)) {
      fail(`${path.relative(root, file)} is missing ${key}`);
    }
  }

  if (typeof descriptor.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(descriptor.id)) {
    fail(`${path.relative(root, file)} id must match ^[a-z0-9][a-z0-9-]*$`);
  }
  if (!allowedKinds.has(descriptor.kind)) {
    fail(`${path.relative(root, file)} has unsupported kind '${descriptor.kind}'`);
  }
  if (!allowedStatuses.has(descriptor.status)) {
    fail(`${path.relative(root, file)} has unsupported status '${descriptor.status}'`);
  }
  assertUniqueArray(file, descriptor, "capabilities");
  assertUniqueArray(file, descriptor, "negativeCapabilities");
  assertUniqueArray(file, descriptor, "authoritySources");

  for (const source of descriptor.authoritySources ?? []) {
    if (!allowedAuthoritySources.has(source)) {
      fail(`${path.relative(root, file)} has unsupported authority source '${source}'`);
    }
  }
  if (descriptor.authoritySources?.includes("appType")) {
    fail(`${path.relative(root, file)} incorrectly treats appType as authority`);
  }
  if (descriptor.authoritySources?.includes("conversationRole")) {
    fail(`${path.relative(root, file)} incorrectly treats conversationRole as authority`);
  }

  return descriptor;
}

function assertHostedDualHumanAgentTemplate(dir, descriptor) {
  if (descriptor.kind !== "hosted-dual-human-agent-app") return;

  const requiredCapabilities = [
    "oauth.sign_in",
    "oauth.userinfo",
    "agent_login.direct_callback",
    "agent_manifest.discovery",
    "local.session",
    "http_api.session_context",
    "static.auth_gate",
  ];
  for (const capability of requiredCapabilities) {
    if (!descriptor.capabilities.includes(capability)) {
      fail(`${descriptor.id} must declare capability ${capability}`);
    }
  }

  const requiredNegatives = [
    "messages.read",
    "messages.send",
    "agent_event.ingest",
    "bot.sender",
    "raw_userinfo.expose",
    "token.expose",
    "custom_action_card",
  ];
  for (const capability of requiredNegatives) {
    if (!descriptor.negativeCapabilities.includes(capability)) {
      fail(`${descriptor.id} must explicitly block ${capability}`);
    }
  }

  const workerSource = path.join(dir, "worker/src/index.ts");
  if (!fs.existsSync(workerSource)) {
    fail(`${descriptor.id} is missing worker/src/index.ts`);
    return;
  }
  const source = fs.readFileSync(workerSource, "utf8");
  const requiredSnippets = [
    'schema: "raft-agent-manifest.v0"',
    '"/.well-known/raft-agent-manifest.json"',
    '"/.well-known/slock-agent-manifest.json"',
    '"/login/raft/callback"',
    '"/api/auth/me"',
  ];
  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) {
      fail(`${descriptor.id} worker source must include ${snippet}`);
    }
  }
  if (source.includes('schema: "slock-agent-manifest.v0"')) {
    fail(`${descriptor.id} must use raft-agent-manifest.v0, not slock-agent-manifest.v0`);
  }
}

for (const dir of listDirs(path.join(root, "templates"))) {
  const readme = path.join(dir, "README.md");
  if (!fs.existsSync(readme)) {
    fail(`${path.relative(root, dir)} is missing README.md`);
  }
  const descriptorFile = path.join(dir, "raft-template.json");
  if (!fs.existsSync(descriptorFile)) {
    fail(`${path.relative(root, dir)} is missing raft-template.json`);
    continue;
  }
  const descriptor = validateDescriptor(descriptorFile);
  if (descriptor) {
    assertHostedDualHumanAgentTemplate(dir, descriptor);
  }
}

if (failures.length > 0) {
  console.error("Conformance failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Conformance passed.");

