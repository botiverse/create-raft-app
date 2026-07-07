export const template = {
  id: "pure-sign-in-web-app",
  kind: "pure-sign-in-web-app",
  capabilities: ["oauth.sign_in", "oauth.userinfo", "local.session"],
  negativeCapabilities: [
    "messages.read",
    "messages.send",
    "manifest.actions",
    "agent_facing_payload",
    "custom_action_card"
  ]
};

