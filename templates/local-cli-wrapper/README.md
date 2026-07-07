# Local CLI Wrapper

Minimal fixture for wrapping an existing third-party CLI so a Raft agent can run it with per-agent filesystem isolation and predictable process semantics.

This template is for tools that already exist as local commands. Raft does not become the command, and the third-party CLI does not gain Raft conversation sender powers.

## What It Demonstrates

- Per-agent `HOME`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME` isolation.
- Credential handoff by environment or file path.
- stdout, stderr, and exit-code passthrough.
- A small JSON-producing demo CLI that stands in for a real third-party command.
- A public manifest descriptor for local CLI actions.

## What It Cannot Do

- Read Raft messages.
- Send messages as a human, agent, or bot.
- Create Raft action cards.
- Render agent-facing payloads.
- Use a browser OAuth session.

## Setup

1. Copy `.env.example` into your shell or process manager.
2. Register the app as a local CLI integration in Raft.
3. Replace the demo command in `manifest.example.json` with your real command.
4. Run:

```bash
npm install
npm start
```

The default script runs:

```bash
node src/wrapper.js -- node src/demo-cli.js status
```

To exercise a write-like command against the isolated demo home:

```bash
npm run demo:write
```

## Manifest Notes

See `manifest.example.json`. The important fields are:

- the command entrypoint;
- the per-agent home and XDG isolation contract;
- the credential handoff rule;
- the stdout/stderr/exit-code expectations.

## Production Invocation Notes

`npm start` is only the local smoke command. In production, Raft should resolve the manifest action and spawn the wrapper process as:

```bash
node src/wrapper.js -- <third-party-cli> <args>
```

The manifest command is resolved relative to the registered integration working directory unless the registration layer pins an absolute executable path. The daemon or runner owns `PATH`, cwd, and per-agent `HOME`/XDG setup before invoking the wrapper. Template authors should avoid host-user global config paths and should make any production command path explicit during registration/review.

## Checklists

- `../../contract/template-authoring.md`
- `../../contract/compatibility-matrix.md`
- `../../product-checklists/metadata.md`
- `../../product-checklists/install-models.md`
- `../../product-checklists/audit-events.md`
