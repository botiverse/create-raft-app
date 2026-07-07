import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4181);
const appOrigin = (process.env.APP_ORIGIN ?? `http://localhost:${port}`).replace(/\/$/, "");
const actionToken = process.env.ACTION_BEARER_TOKEN ?? "dev-action-token";

app.use(express.json({ limit: "32kb" }));

function actionEnvelope(result, meta = {}) {
  return { ok: true, result, meta };
}

function errorEnvelope(code, message, status = 400) {
  return {
    status,
    body: {
      ok: false,
      error: { code, message }
    }
  };
}

function requireBearer(req, res, next) {
  const expected = `Bearer ${actionToken}`;
  if (req.header("authorization") !== expected) {
    const error = errorEnvelope("UNAUTHORIZED", "Missing or invalid action bearer token.", 401);
    res.status(error.status).json(error.body);
    return;
  }
  next();
}

function manifest() {
  return {
    name: "Hosted HTTP Action Service Demo",
    description: "Manifest-declared HTTP action service with public action envelope responses.",
    manifestVersion: "0.1",
    appType: "http_api",
    conversationRole: "tool_api",
    baseUrl: appOrigin,
    actions: [
      {
        name: "summarize",
        method: "POST",
        path: "/actions/summarize",
        auth: { type: "bearer" },
        response: { envelope: "public_action_envelope" }
      }
    ],
    unsupported: ["custom_action_card", "messages.read", "messages.send"]
  };
}

app.get("/", (_req, res) => {
  res.type("text/plain").send("Hosted HTTP Action Service fixture. See /.well-known/raft-app-manifest.json\n");
});

app.get("/.well-known/raft-app-manifest.json", (_req, res) => {
  res.json(manifest());
});

app.post("/actions/summarize", requireBearer, (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    const error = errorEnvelope("INVALID_PARAMS", "Request JSON must include a non-empty text string.");
    res.status(error.status).json(error.body);
    return;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const summary = words.length <= 12 ? text : `${words.slice(0, 12).join(" ")}...`;

  res.json(
    actionEnvelope(
      {
        summary,
        wordCount: words.length
      },
      {
        idempotencyKey: req.header("idempotency-key") ?? null
      }
    )
  );
});

app.use((req, res) => {
  const error = errorEnvelope("NOT_FOUND", `No fixture route for ${req.method} ${req.path}.`, 404);
  res.status(error.status).json(error.body);
});

app.listen(port, () => {
  console.log(`Hosted HTTP Action Service fixture listening on ${appOrigin}`);
});
