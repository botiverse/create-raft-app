import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const command = process.argv[2] || "status";
const stateDir = path.join(process.env.HOME || ".", ".demo-third-party");
const stateFile = path.join(stateDir, "state.json");

fs.mkdirSync(stateDir, { recursive: true });

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return { values: [] };
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (command === "status") {
  writeJson({
    ok: true,
    appId: process.env.RAFT_APP_ID,
    agentId: process.env.RAFT_AGENT_ID,
    home: process.env.HOME,
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    xdgDataHome: process.env.XDG_DATA_HOME,
    tokenFileConfigured: Boolean(process.env.RAFT_AGENT_TOKEN_FILE),
    state: readState()
  });
} else if (command === "write") {
  const value = process.argv[3];
  if (!value) {
    console.error("write requires a value");
    process.exit(2);
  }
  const state = readState();
  state.values.push({ value, at: new Date().toISOString() });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  writeJson({ ok: true, state });
} else {
  console.error(`Unknown demo command: ${command}`);
  process.exit(2);
}
