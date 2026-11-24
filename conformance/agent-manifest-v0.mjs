// Checks a manifest against the documented raft-agent-manifest.v0 contract
// (https://docs.raft.build/developers/login-with-raft/#manifest-fields).
// It follows the rules Raft applies when it reads a v0 manifest closely enough
// to catch what templates get wrong, but it is not a copy of Raft's validator.
// It is intentionally stricter in places, so templates teach only the current
// shape: the schema must be the Raft-branded name, unknown top-level fields
// (such as a legacy manifestVersion, oauth, agentLogin, or http_api block) are
// errors, and actions are rejected outside execution.mode http_api.
// Returns a list of problems; an empty list means the manifest is valid.

export const RAFT_AGENT_MANIFEST_SCHEMA_V0 = "raft-agent-manifest.v0";

const topLevelFields = new Set([
  "schema",
  "service",
  "name",
  "description",
  "docs_url",
  "app_origin",
  "execution",
  "auth",
  "actions",
  "credential_boundary",
  "context_check",
]);
const actionMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const namePattern = /^[A-Za-z0-9._:-]{1,80}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Raft resolves an action path as a URL: against a placeholder origin when it
// validates the manifest, and against execution.base_url (or app_origin) when
// it calls the action. Either way the result must stay on that origin and
// carry no credentials or fragment.
function staysOnOrigin(path, manifest) {
  const bases = ["https://manifest.local"];
  const callBase = manifest.execution?.base_url ?? manifest.app_origin;
  if (typeof callBase === "string") bases.push(callBase);
  for (const base of bases) {
    let baseUrl, resolved;
    try {
      baseUrl = new URL(base);
      resolved = new URL(path, baseUrl);
    } catch {
      if (base === "https://manifest.local") return false;
      continue; // an invalid base_url is reported on its own
    }
    if (resolved.origin !== baseUrl.origin || resolved.username || resolved.password || resolved.hash) return false;
  }
  return true;
}

export function validateAgentManifestV0(manifest) {
  const problems = [];
  const problem = (message) => problems.push(message);

  function checkUrl(value, field) {
    if (value === undefined) return;
    if (typeof value !== "string" || !value.trim()) return problem(`${field} must be a non-empty URL string`);
    let url;
    try {
      url = new URL(value);
    } catch {
      return problem(`${field} must be a valid URL`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") problem(`${field} must use http or https`);
    if (url.username || url.password) problem(`${field} must not include credentials`);
  }

  function checkOptionalString(value, field) {
    if (value !== undefined && typeof value !== "string") problem(`${field} must be a string`);
  }

  function checkFieldSpecs(value, field, allowRequired) {
    if (value === undefined) return;
    if (!isRecord(value)) return problem(`${field} must be an object`);
    for (const [key, spec] of Object.entries(value)) {
      if (!namePattern.test(key)) problem(`${field} key '${key}' may only contain letters, digits, dot, underscore, colon, or dash`);
      if (!isRecord(spec)) {
        problem(`${field}.${key} must be an object`);
        continue;
      }
      if (typeof spec.type !== "string" || !spec.type.trim()) problem(`${field}.${key}.type must be a non-empty string`);
      checkOptionalString(spec.description, `${field}.${key}.description`);
      if (allowRequired && spec.required !== undefined && typeof spec.required !== "boolean") {
        problem(`${field}.${key}.required must be a boolean`);
      }
    }
  }

  if (!isRecord(manifest)) return ["manifest must be a JSON object"];

  for (const key of Object.keys(manifest)) {
    if (!topLevelFields.has(key)) problem(`unknown top-level field '${key}'`);
  }
  if (manifest.schema !== RAFT_AGENT_MANIFEST_SCHEMA_V0) problem(`schema must be ${RAFT_AGENT_MANIFEST_SCHEMA_V0}`);
  checkOptionalString(manifest.service, "service");
  checkOptionalString(manifest.name, "name");
  checkOptionalString(manifest.description, "description");
  checkUrl(manifest.docs_url, "docs_url");
  checkUrl(manifest.app_origin, "app_origin");

  const execution = manifest.execution;
  let mode;
  if (!isRecord(execution)) {
    problem("execution must be an object");
  } else {
    mode = execution.mode;
    if (mode !== "http_api" && mode !== "local_cli") problem("execution.mode must be http_api or local_cli");
    checkUrl(execution.base_url, "execution.base_url");
    if (mode === "local_cli") {
      const command = execution.command;
      if (typeof command !== "string" || !command.trim()) {
        problem("execution.command must be a non-empty string for local_cli manifests");
      } else if (/[/\\\s]/.test(command.trim()) || command.trim().startsWith("-")) {
        problem("execution.command must be a bare command name, not a path, flag, or shell fragment");
      }
    }
  }

  if (manifest.auth !== undefined) {
    if (!isRecord(manifest.auth)) {
      problem("auth must be an object");
    } else {
      if (manifest.auth.type !== "login_with_raft") problem("auth.type must be login_with_raft");
      checkUrl(manifest.auth.login_url, "auth.login_url");
    }
  }

  if (manifest.credential_boundary !== undefined) {
    const boundary = manifest.credential_boundary;
    if (!isRecord(boundary)) {
      problem("credential_boundary must be an object");
    } else {
      // per_agent_home is the only documented storage value.
      if (boundary.storage !== "per_agent_home") {
        problem("credential_boundary.storage must be per_agent_home");
      } else if (boundary.forbid_user_home !== true) {
        problem("credential_boundary.forbid_user_home must be true with per_agent_home");
      }
    }
  }

  if (manifest.context_check !== undefined) {
    const check = manifest.context_check;
    if (!isRecord(check)) {
      problem("context_check must be an object");
    } else {
      checkUrl(check.url, "context_check.url");
      if (check.method !== undefined && check.method !== "GET" && check.method !== "POST") {
        problem("context_check.method must be GET or POST");
      }
    }
  }

  if (manifest.actions !== undefined) {
    if (!Array.isArray(manifest.actions)) {
      problem("actions must be an array");
    } else {
      if (mode !== undefined && mode !== "http_api" && manifest.actions.length > 0) {
        problem("actions are only supported for execution.mode http_api");
      }
      const seen = new Set();
      manifest.actions.forEach((action, index) => {
        const at = `actions[${index}]`;
        if (!isRecord(action)) return problem(`${at} must be an object`);
        if (typeof action.name !== "string" || !namePattern.test(action.name)) {
          problem(`${at}.name must be letters, digits, dot, underscore, colon, or dash`);
        } else if (seen.has(action.name)) {
          problem(`duplicate action name: ${action.name}`);
        } else {
          seen.add(action.name);
        }
        checkOptionalString(action.description, `${at}.description`);
        const endpoint = action.endpoint;
        if (!isRecord(endpoint)) {
          problem(`${at}.endpoint must be an object with method and path`);
        } else {
          if (typeof endpoint.method !== "string" || !actionMethods.has(endpoint.method.toUpperCase())) {
            problem(`${at}.endpoint.method must be GET, POST, PUT, PATCH, or DELETE`);
          }
          const path = endpoint.path;
          if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("#")) {
            problem(`${at}.endpoint.path must be a relative service path starting with /`);
          } else if (!staysOnOrigin(path, manifest)) {
            // WHATWG URL parsing turns e.g. "/\\evil.test/x" into another host.
            problem(`${at}.endpoint.path must resolve to the service's own origin`);
          }
        }
        checkFieldSpecs(action.parameters, `${at}.parameters`, true);
        checkFieldSpecs(action.returns, `${at}.returns`, false);
        if (action.response !== undefined) {
          const response = action.response;
          if (!isRecord(response) || response.type !== "file") {
            problem(`${at}.response.type must be file`);
          } else {
            checkOptionalString(response.contentType, `${at}.response.contentType`);
            checkOptionalString(response.filename, `${at}.response.filename`);
            checkOptionalString(response.description, `${at}.response.description`);
            if (response.maxBytes !== undefined && !(Number.isInteger(response.maxBytes) && response.maxBytes > 0)) {
              problem(`${at}.response.maxBytes must be a positive integer`);
            }
          }
        }
      });
    }
  }

  return problems;
}
