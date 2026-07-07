export const template = {
  id: "hosted-http-action-service",
  kind: "hosted-http-action-service",
  capabilities: [
    "manifest.discovery",
    "manifest.actions",
    "http.action.invoke",
    "public_action_envelope",
    "structured_errors",
    "idempotency_key"
  ],
  negativeCapabilities: [
    "oauth.sign_in",
    "messages.read",
    "messages.send",
    "agent_facing_payload",
    "custom_action_card"
  ]
};
