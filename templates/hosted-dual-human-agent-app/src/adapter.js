export const template = {
  id: "hosted-dual-human-agent-app",
  kind: "hosted-dual-human-agent-app",
  capabilities: [
    "oauth.sign_in",
    "oauth.userinfo",
    "agent_login.direct_callback",
    "agent_manifest.discovery",
    "local.session",
    "http_api.session_context",
    "static.auth_gate"
  ],
  negativeCapabilities: [
    "messages.read",
    "messages.send",
    "agent_event.ingest",
    "bot.sender",
    "raw_userinfo.expose",
    "token.expose",
    "custom_action_card"
  ]
};
