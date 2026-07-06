import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type MeResponse =
  | {
      ok: true;
      account: {
        display_name: string;
        principal_type: "human" | "agent";
      };
    }
  | { error: string };

function App() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then(setMe)
      .catch(() => setMe({ error: "API unavailable" }));
  }, []);

  const loggedIn = me && "ok" in me;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Raft-native app template</p>
          <h1>__APP_NAME__</h1>
          <p>
            Hono Worker API, React admin, generated OpenAPI, public docs, and
            Raft Agent Login integration points.
          </p>
        </div>
        <div className="actions">
          <a className="button primary" href="/api/auth/login">
            Login with Raft
          </a>
          <a className="button" href="/docs/">
            Docs
          </a>
          <a className="button" href="/api-docs">
            API Docs
          </a>
        </div>
      </section>

      <section className="grid">
        <article>
          <h2>Session</h2>
          {loggedIn ? (
            <p>
              Signed in as {me.account.display_name} ({me.account.principal_type})
            </p>
          ) : (
            <p>{me && "error" in me ? me.error : "Checking session..."}</p>
          )}
        </article>
        <article>
          <h2>Agent contract</h2>
          <p>
            Exposes <code>/.well-known/raft-agent-manifest.json</code>, Bearer
            auth, and OpenAPI routes for agent tooling.
          </p>
        </article>
        <article>
          <h2>Next step</h2>
          <p>
            Replace the auth stubs with the real Raft OAuth exchange and add
            your product domain routes.
          </p>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
