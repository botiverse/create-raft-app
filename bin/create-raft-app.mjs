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
    description: "Hono Worker API + React admin + Cloudflare Workers + Raft Agent Login + OpenAPI docs",
  },
];

function usage() {
  return `create-raft-app

Usage:
  npm create raft-app@latest <project-name>
  npm create raft-app@latest <project-name> -- --template hono-react-cfworker

Options:
  --template <name>   Template name. Available: ${templates.map((t) => t.name).join(", ")}
  --yes, -y           Use defaults for prompts
  --no-install        Do not run npm install after scaffolding
  --list-templates    Print available templates
  --help, -h          Show help
`;
}

function parseArgs(argv) {
  const options = {
    projectName: undefined,
    template: undefined,
    yes: false,
    install: true,
    listTemplates: false,
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
    console.log(`  ${index + 1}. ${template.name} - ${template.description}`);
  });
  const answer = await rl.question("Template name or number: ");
  const trimmed = answer.trim();
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

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.listTemplates) {
    for (const template of templates) {
      console.log(`${template.name}\t${template.description}`);
    }
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const projectName = options.projectName || (options.yes ? "my-raft-app" : await promptForProjectName(rl));
    const templateName = options.template || (options.yes ? templates[0].name : await promptForTemplate(rl));
    const template = templates.find((item) => item.name === templateName);
    if (!template) {
      throw new Error(`Unknown template '${templateName}'. Use --list-templates to see available templates.`);
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

    console.log(`\nCreated ${projectName} from ${template.name}.`);
    if (options.install) {
      console.log("\nInstalling dependencies with npm...");
      await run("npm", ["install"], targetDir);
    }
    console.log(`\nNext steps:
  cd ${projectName}
  npm run build
  npm run dev

Configure Raft secrets and Worker vars before production deploy. See AGENTS.md and docs/public/agent-guide.md.
`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
