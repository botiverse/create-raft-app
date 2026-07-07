export const template = {
  id: "oauth-http-action-service",
  kind: "oauth-http-action-service",
  capabilities: [
    "oauth.sign_in",
    "oauth.userinfo",
    "agent_login.callback",
    "local.agent_session",
    "manifest.discovery",
    "manifest.actions",
    "http.action.invoke",
    "public_action_envelope",
    "token_revoke_boundary"
  ],
  negativeCapabilities: [
    "messages.read",
    "messages.send",
    "raw_raft_token_exposure",
    "agent_facing_payload",
    "custom_action_card"
  ]
};
