#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const templatesRoot = path.join(root, "templates");

const templates = [
  {
    name: "hono-react-cfworker",
    label: "Full Cloudflare Worker app",
    description: "Hono Worker API + React admin + Cloudflare Workers + Raft Agent Login + OpenAPI docs",
    agentHandoff: {
      files: ["AGENTS.md", "README.md", "docs/public/agent-guide.md", "raft-template.json"],
      commands: ["npm run build", "npm run dev"],
      env: ["RAFT_CLIENT_ID", "RAFT_CLIENT_SECRET", "RAFT_APP_ORIGIN", "RAFT_API_ORIGIN"],
      urls: [
        { label: "humanCallback", url: "http://localhost:8787/login/raft/callback" },
        { label: "agentManifest", url: "http://localhost:8787/.well-known/raft-agent-manifest.json" },
      ],
      registration: [
        "Register the deployed callback and manifest URLs before production use.",
        "Implement real Raft OAuth exchange and agent-token verification before exposing protected APIs.",
      ],
    },
  },
  {
    name: "pure-sign-in-web-app",
    label: "Human sign-in only",
    description: "Login with Raft + userinfo/session only; no message access, actions, or agent payloads",
    agentHandoff: {
      files: ["AGENTS.md", "README.md", "raft-app-init.json", "raft-template.json"],
      commands: ["npm run build", "npm start"],
      env: ["RAFT_CLIENT_ID", "RAFT_CLIENT_SECRET", "RAFT_APP_ORIGIN", "RAFT_API_ORIGIN", "APP_ORIGIN", "SESSION_SECRET"],
      urls: [{ label: "humanCallback", url: "http://localhost:4173/auth/callback" }],
      registration: [
        "Register an OAuth client with redirect URI http://localhost:4173/auth/callback.",
        "This template is sign-in only; do not add agent/action scopes unless the app actually implements them.",
      ],
    },
  },
  {
    name: "local-cli-wrapper",
    label: "Local CLI integration",
    description: "Local CLI wrapper with isolated HOME/XDG state and service-owned credential handoff",
    agentHandoff: {
      files: ["AGENTS.md", "README.md", "manifest.example.json", "raft-template.json"],
      commands: ["npm run build", "npm start", "npm run demo:write"],
      env: ["RAFT_AGENT_ID", "RAFT_AGENT_HOME", "RAFT_AGENT_TOKEN_FILE", "RAFT_APP_ID"],
      urls: [],
      registration: [
        "Register the wrapper command from manifest.example.json as a local CLI integration.",
        "Pin the production command path and keep credentials in the runner-owned handoff path.",
      ],
    },
  },
  {
    name: "hosted-http-action-service",
    label: "Hosted HTTP actions",
    description: "Hosted manifest action service returning public action envelopes and structured errors",
    agentHandoff: {
      files: ["AGENTS.md", "README.md", "manifest.example.json", "raft-template.json"],
      commands: ["npm run build", "npm start"],
      env: ["APP_ORIGIN", "ACTION_BEARER_TOKEN"],
      urls: [
        { label: "actionManifest", url: "http://localhost:4181/.well-known/raft-app-manifest.json" },
        { label: "demoAction", url: "http://localhost:4181/actions/summarize" },
      ],
      registration: [
        "Register the manifest URL after deployment.",
        "Replace the dev action bearer token with a reviewed service-owned credential before production use.",
      ],
    },
  },
  {
    name: "oauth-http-action-service",
    label: "OAuth + hosted actions",
    description: "OAuth + hosted manifest action service with service-local agent sessions",
    agentHandoff: {
      files: ["AGENTS.md", "README.md", "manifest.example.json", "raft-template.json"],
      commands: ["npm run build", "npm start"],
      env: ["RAFT_CLIENT_ID", "RAFT_CLIENT_SECRET", "RAFT_APP_ORIGIN", "RAFT_API_ORIGIN", "APP_ORIGIN", "SESSION_SECRET"],
      urls: [
        { label: "humanCallback", url: "http://localhost:4182/auth/callback" },
        { label: "agentCallback", url: "http://localhost:4182/agent/callback" },
        { label: "actionManifest", url: "http://localhost:4182/.well-known/raft-app-manifest.json" },
      ],
      registration: [
        "Register both callback URLs and the action manifest URL.",
        "Persist service-local agent sessions with expiry before production use.",
      ],
    },
  },
  {
    name: "hosted-dual-human-agent-app",
    label: "Hosted human + agent app",
    description: "Hosted app supporting browser human login and direct agent callback sessions",
    agentHandoff: {
      files: ["AGENTS.md", "README.md", "manifest.example.json", "raft-template.json"],
      commands: ["npm run build", "npm start"],
      env: ["RAFT_CLIENT_ID", "RAFT_CLIENT_SECRET", "RAFT_APP_ORIGIN", "RAFT_API_ORIGIN", "APP_ORIGIN", "SESSION_SECRET"],
      urls: [
        { label: "sharedCallback", url: "http://localhost:4174/auth/raft/callback" },
        { label: "agentManifest", url: "http://localhost:4174/.well-known/raft-agent-manifest.json" },
        { label: "sessionContext", url: "http://localhost:4174/api/session" },
      ],
      registration: [
        "Register the callback URL and agent manifest URL.",
        "Keep direct no-state callback acceptance restricted to agent principals.",
      ],
    },
  },
];

const defaultTemplate = templates[0];

function templateNames() {
  return templates.map((template) => template.name).join(", ");
}

function formatTemplate(template, index) {
  const prefix = typeof index === "number" ? `${index + 1}. ` : "";
  return `${prefix}${template.name} - ${template.label}\n   ${template.description}`;
}

function usage() {
  return `create-raft-app

Usage:
  npm create raft-app@latest <project-name>
  npm create raft-app@latest <project-name> -- --template ${defaultTemplate.name}
  npm create raft-app@latest <project-name> -- --list-templates

Options:
  --template <name>   Template name. Available: ${templateNames()}
  --yes, -y           Use defaults for prompts
  --no-install        Do not run npm install after scaffolding
  --list-templates    Print available templates
  --json              Print machine-readable JSON for template lists or scaffold results
  --help, -h          Show help

Default template: ${defaultTemplate.name}
`;
}

function templateForJson(template) {
  return {
    name: template.name,
    label: template.label,
    description: template.description,
    agentHandoff: template.agentHandoff,
  };
}

function templateListJson() {
  return {
    schemaVersion: "create-raft-app.templates.v1",
    defaultTemplate: defaultTemplate.name,
    templates: templates.map(templateForJson),
  };
}

function parseArgs(argv) {
  const options = {
    projectName: undefined,
    template: undefined,
    yes: false,
    install: true,
    listTemplates: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--template") {
      options.template = argv[++i];
    } else if (arg.startsWith("--template=")) {
      options.template = arg.slice("--template=".length);
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--no-install") {
      options.install = false;
    } else if (arg === "--list-templates") {
      options.listTemplates = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("-") && !options.projectName) {
      options.projectName = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function packageNameFromProject(projectName) {
  return projectName
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .at(-1)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "my-raft-app";
}

async function isEmptyDirectory(dir) {
  if (!existsSync(dir)) return true;
  const entries = await readdir(dir);
  return entries.length === 0;
}

async function promptForProjectName(rl) {
  const answer = await rl.question("Project name: ");
  return answer.trim() || "my-raft-app";
}

async function promptForTemplate(rl) {
  if (templates.length === 1) {
    const [template] = templates;
    const answer = await rl.question(`Template [${template.name}]: `);
    return answer.trim() || template.name;
  }
  console.log("Available templates:");
  templates.forEach((template, index) => {
    console.log(`  ${formatTemplate(template, index).replace("\n", "\n     ")}`);
  });
  const answer = await rl.question(`Template name or number [${defaultTemplate.name}]: `);
  const trimmed = answer.trim();
  if (!trimmed) {
    return defaultTemplate.name;
  }
  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= templates.length) {
    return templates[index - 1].name;
  }
  return trimmed;
}

async function copyTemplate(source, destination, replacements) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetName = entry.name === "_gitignore" ? ".gitignore" : entry.name;
    const destinationPath = path.join(destination, targetName);
    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, destinationPath, replacements);
      continue;
    }
    if (entry.isFile()) {
      const fileStat = await stat(sourcePath);
      const textExtensions = new Set([
        ".json",
        ".jsonc",
        ".md",
        ".ts",
        ".tsx",
        ".js",
        ".mjs",
        ".html",
        ".css",
        ".toml",
        ".sql",
        ".yml",
        ".yaml",
        ".txt",
      ]);
      const ext = path.extname(entry.name);
      if (textExtensions.has(ext) || entry.name === "_gitignore") {
        let content = await readFile(sourcePath, "utf8");
        for (const [key, value] of Object.entries(replacements)) {
          content = content.replaceAll(`__${key}__`, value);
        }
        await writeFile(destinationPath, content, { mode: fileStat.mode });
      } else {
        await cp(sourcePath, destinationPath, { force: false });
      }
    }
  }
}

function run(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: options.stdio ?? "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function scaffoldResult({ projectName, packageName, template, targetDir, installed }) {
  return {
    schemaVersion: "create-raft-app.scaffold-result.v1",
    projectName,
    packageName,
    targetDir,
    installed,
    template: templateForJson(template),
    nextSteps: {
      commands: [`cd ${projectName}`, ...template.agentHandoff.commands],
      agentHandoffFiles: template.agentHandoff.files,
      env: template.agentHandoff.env,
      urls: template.agentHandoff.urls,
      registration: template.agentHandoff.registration,
    },
  };
}

function printHumanNextSteps(projectName, template) {
  console.log(`\nNext steps:
  cd ${projectName}
${template.agentHandoff.commands.map((command) => `  ${command}`).join("\n")}

Agent handoff:
  Files: ${template.agentHandoff.files.join(", ")}
  Env: ${template.agentHandoff.env.length > 0 ? template.agentHandoff.env.join(", ") : "none"}
${template.agentHandoff.urls.length > 0 ? `  URLs:\n${template.agentHandoff.urls.map((item) => `    ${item.label}: ${item.url}`).join("\n")}\n` : ""}  Registration:
${template.agentHandoff.registration.map((item) => `    - ${item}`).join("\n")}
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.listTemplates) {
    if (options.json) {
      console.log(JSON.stringify(templateListJson(), null, 2));
      return;
    }
    console.log("Available templates:");
    for (const [index, template] of templates.entries()) {
      console.log(formatTemplate(template, index));
    }
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const projectName = options.projectName || (options.yes ? "my-raft-app" : await promptForProjectName(rl));
    const templateName = options.template || (options.yes ? templates[0].name : await promptForTemplate(rl));
    const template = templates.find((item) => item.name === templateName);
    if (!template) {
      throw new Error(`Unknown template '${templateName}'. Available templates: ${templateNames()}`);
    }

    const targetDir = path.resolve(process.cwd(), projectName);
    if (!(await isEmptyDirectory(targetDir))) {
      throw new Error(`Target directory is not empty: ${targetDir}`);
    }

    const packageName = packageNameFromProject(projectName);
    const envPrefix = packageName.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const displayName = packageName
      .split("-")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");

    await copyTemplate(path.join(templatesRoot, template.name), targetDir, {
      APP_NAME: displayName,
      PACKAGE_NAME: packageName,
      TEMPLATE_NAME: template.name,
      ENV_PREFIX: envPrefix,
    });

    if (options.install) {
      if (!options.json) {
        console.log(`\nCreated ${projectName} from ${template.name}.`);
        console.log(template.description);
        console.log("\nInstalling dependencies with npm...");
      }
      await run("npm", ["install"], targetDir, {
        stdio: options.json ? ["ignore", "ignore", "inherit"] : "inherit",
      });
    } else if (!options.json) {
      console.log(`\nCreated ${projectName} from ${template.name}.`);
      console.log(template.description);
    }
    const result = scaffoldResult({ projectName, packageName, template, targetDir, installed: options.install });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanNextSteps(projectName, template);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
