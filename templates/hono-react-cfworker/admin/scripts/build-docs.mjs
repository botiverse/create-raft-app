import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const docsRoot = path.join(repoRoot, "docs/public");
const outRoot = path.join(repoRoot, "admin/public/docs");

const pages = [
  {
    slug: "agent-guide",
    title: "Agent Guide",
    source: "agent-guide.md",
  },
  {
    slug: "public-api-reference",
    title: "Public API Reference",
    source: "public-api-reference.md",
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let code = [];
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      html.push(`<p>• ${inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</p>`);
    } else if (line.trim()) {
      html.push(`<p>${inlineMarkdown(line.trim())}</p>`);
    }
  }
  return html.join("\n");
}

function layout(title, body) {
  const nav = pages
    .map((page) => `<a href="/docs/${page.slug}/">${escapeHtml(page.title)}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - __APP_NAME__ Docs</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; color: #0f172a; background: #f8fafc; }
    header, main { max-width: 1040px; margin: 0 auto; padding: 22px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    nav { display: flex; gap: 12px; flex-wrap: wrap; }
    a { color: #0369a1; text-decoration: none; }
    .panel { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 28px; }
    p { color: #475569; line-height: 1.7; }
    code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1px 4px; font-size: 0.9em; }
    pre { overflow: auto; background: #020617; color: #e2e8f0; padding: 16px; border-radius: 8px; }
    /* Inside a code block, the inline-code chrome (light bg) makes text
       unreadable on the dark pre; reset it so it inherits the light pre color. */
    pre code { background: transparent; border: 0; padding: 0; color: inherit; font-size: inherit; }
  </style>
</head>
<body>
  <header>
    <strong><a href="/">__APP_NAME__</a></strong>
    <nav><a href="/docs/">Docs</a><a href="/api-docs">API Docs</a>${nav}</nav>
  </header>
  <main><section class="panel">${body}</section></main>
</body>
</html>`;
}

await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });

const indexBody = `<h1>Documentation</h1>${pages
  .map((page) => `<p><a href="/docs/${page.slug}/">${escapeHtml(page.title)}</a></p>`)
  .join("")}`;
await writeFile(path.join(outRoot, "index.html"), layout("Documentation", indexBody));

for (const page of pages) {
  const markdown = await readFile(path.join(docsRoot, page.source), "utf8");
  const pageDir = path.join(outRoot, page.slug);
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, "index.html"), layout(page.title, renderMarkdown(markdown)));
}

console.log(`Built ${pages.length + 1} docs pages`);
