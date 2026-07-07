export const template = {
  id: "local-cli-wrapper",
  kind: "local-cli-wrapper",
  capabilities: [
    "manifest.discovery",
    "cli.invoke",
    "env.home_isolation",
    "credential_handoff.file",
    "stdout_json",
    "stderr_passthrough",
    "exit_code_passthrough"
  ],
  negativeCapabilities: [
    "messages.read",
    "messages.send",
    "browser_session",
    "agent_facing_payload",
    "custom_action_card"
  ]
};
