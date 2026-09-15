/**
 * <raft-avatar> — zero-dependency avatar chip shared across Raft apps.
 *
 * Contract (frozen 2026-09-15, #wg-artifacts thread 5e9ba0b0):
 *   attempt list = [src] → initial. The pixel tier is reserved as a config
 *   slot, intentionally empty in v1: Raft's generated pixel SVGs are served
 *   with `cross-origin-resource-policy: same-origin` and cannot be embedded
 *   cross-origin, and the pattern set/selection is Raft-side, so a faithful
 *   local replica does not exist. Do not add tiers that differ per app.
 *
 * Attributes (all optional except that without `src` only the initial shows):
 *   src  — URL of the real profile picture, resolved by the host app (Raft
 *          userinfo `picture`, typically https://cdn.slock.ai/avatars/*.webp).
 *          The element never fetches identity data by id; there is no
 *          public id→picture resolver.
 *   type — "agent" | "human". Colors match raft-ui's brutal Avatar
 *          (agent cyan / human lavender). Default: "agent".
 *   name — display name; first grapheme becomes the initial. Default "?".
 *   size — chip edge length in px. Default 24.
 *
 * Works when inserted into the DOM after customElements.define (SSR output,
 * htmx fragment swaps): the element upgrades automatically.
 *
 * Load semantics: the image attempt "mounts on load" — the initial is always
 * painted underneath and the picture fades in only after a successful load,
 * so a failing or blocked URL degrades to the initial with no broken-image
 * glyph (mirrors the app-side behavior contract).
 */

const COLORS = {
  agent: { bg: "oklch(78.3% 0.135 219.2)", fg: "#141111" },
  human: { bg: "oklch(78.3% 0.078 294.55)", fg: "#141111" },
};

const STYLE = `
:host { display: inline-block; line-height: 0; }
.chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid #141111;
  border-radius: 2px;
  box-sizing: border-box;
  user-select: none;
}
.initial {
  font-weight: 600;
  letter-spacing: 0;
}
img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 120ms linear;
}
img.loaded { opacity: 1; }
`;

class RaftAvatar extends HTMLElement {
  static get observedAttributes() {
    return ["src", "type", "name", "size"];
  }

  #initial = "?";
  #type = "agent";
  #size = 24;
  #src = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.#apply();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#apply();
  }

  #apply() {
    const src = this.getAttribute("src");
    this.#src = src && src.trim() ? src.trim() : null;
    this.#type = this.getAttribute("type") === "human" ? "human" : "agent";
    const raw = (this.getAttribute("name") || "").trim();
    this.#initial = Array.from(raw)[0]?.toUpperCase() || "?";
    const size = Number(this.getAttribute("size"));
    this.#size = Number.isFinite(size) && size >= 8 ? Math.floor(size) : 24;
    this.#render();
  }

  #render() {
    const c = COLORS[this.#type];
    const fontPx = Math.max(8, Math.round(this.#size * 0.5));
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <span class="chip" part="chip"
        style="background:${c.bg};width:${this.#size}px;height:${this.#size}px">
        <span class="initial" part="initial"
          style="color:${c.fg};font-size:${fontPx}px">${this.#escape(this.#initial)}</span>
      </span>`;
    // Attempt list, v1: [src]. A failed attempt leaves the initial standing.
    if (this.#src) this.#attemptImage(this.#src);
  }

  #attemptImage(url) {
    const chip = this.shadowRoot.querySelector(".chip");
    const img = document.createElement("img");
    img.part.add("image");
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    // Mounts on load: a blocked/failed URL must never paint a broken glyph.
    img.addEventListener("load", () => {
      if (img.isConnected) img.classList.add("loaded");
    });
    img.addEventListener("error", () => img.remove());
    img.src = url;
    chip.appendChild(img);
  }

  #escape(text) {
    return text.replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }
}

if (!customElements.get("raft-avatar")) {
  customElements.define("raft-avatar", RaftAvatar);
}
