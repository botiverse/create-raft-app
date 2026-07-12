import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, Button } from "raft-ui";
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
    <main className="mx-auto max-w-5xl px-6 py-11 text-slate-900">
      <section className="flex flex-col items-start gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.08em] text-sky-700">
            Raft-native app template
          </p>
          <h1 className="text-4xl font-semibold sm:text-[44px]">__APP_NAME__</h1>
          <p className="mt-3 max-w-xl leading-relaxed text-slate-600">
            Hono Worker API, React admin, generated OpenAPI, public docs, and
            Raft Agent Login integration points.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="primary" render={<a href="/api/auth/login" />}>
            Login with Raft
          </Button>
          <Button variant="outline" render={<a href="/docs/" />}>
            Docs
          </Button>
          <Button variant="outline" render={<a href="/api-docs" />}>
            API Docs
          </Button>
        </div>
      </section>

      <section className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2.5 text-lg font-semibold">Session</h2>
          {loggedIn ? (
            <p className="leading-relaxed text-slate-600">
              Signed in as {me.account.display_name} (
              {me.account.principal_type})
            </p>
          ) : (
            <p className="leading-relaxed text-slate-600">
              {me && "error" in me ? me.error : "Checking session..."}
            </p>
          )}
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2.5 text-lg font-semibold">Agent contract</h2>
          <p className="leading-relaxed text-slate-600">
            Exposes{" "}
            <code className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 text-[0.85em]">
              /.well-known/raft-agent-manifest.json
            </code>
            , Bearer auth, and OpenAPI routes for agent tooling.
          </p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2.5 text-lg font-semibold">Next step</h2>
          <p className="leading-relaxed text-slate-600">
            Replace the auth stubs with the real Raft OAuth exchange and add
            your product domain routes.
          </p>
        </article>
      </section>
    </main>
  );
}

// raft-ui "elegant" theme family (light mode) — sets data-theme so raft-ui
// components render with the elegant design tokens.
createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme="elegant" defaultMode="light">
    <App />
  </ThemeProvider>,
);
