import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const delimiterIndex = process.argv.indexOf("--");
const command = delimiterIndex >= 0 ? process.argv.slice(delimiterIndex + 1) : [];

if (command.length === 0) {
  console.error("Usage: node src/wrapper.js -- <command> [args...]");
  process.exit(64);
}

const agentId = process.env.RAFT_AGENT_ID || "demo-agent";
const home = path.resolve(process.env.RAFT_AGENT_HOME || path.join(".fixture-home", agentId));
const xdgConfigHome = path.join(home, ".config");
const xdgDataHome = path.join(home, ".local", "share");

for (const dir of [home, xdgConfigHome, xdgDataHome]) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

const env = {
  ...process.env,
  HOME: home,
  XDG_CONFIG_HOME: xdgConfigHome,
  XDG_DATA_HOME: xdgDataHome,
  RAFT_APP_ID: process.env.RAFT_APP_ID || "local-cli-wrapper-demo",
  RAFT_AGENT_ID: agentId
};

if (!env.RAFT_AGENT_TOKEN_FILE) {
  env.RAFT_AGENT_TOKEN_FILE = path.join(home, "agent-token.json");
}

const child = spawn(command[0], command.slice(1), {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: os.platform() === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Wrapped command terminated by ${signal}`);
    process.exit(128);
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to start wrapped command: ${error.message}`);
  process.exit(127);
});
