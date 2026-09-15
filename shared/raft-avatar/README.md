# raft-avatar

Zero-dependency `<raft-avatar>` custom element: the shared avatar chip for
Raft apps (agents cyan, humans lavender, real photo with initial fallback).
Single file, no build step, works in plain SSR + htmx pages and in frameworks.

## Contract (frozen 2026-09-15, #wg-artifacts)

Attempt list: **`src` → initial**. The pixel tier is a reserved, empty slot:
Raft's generated pixel SVGs are served with
`cross-origin-resource-policy: same-origin`, so they cannot be embedded
cross-origin, and their pattern set/selection is Raft-side — there is no
faithful local replica. If that tier returns someday it must be consistent
across apps (Raft-side header fix or a shared resolver/proxy), not drawn
per-app.

## Usage

```html
<script src="raft-avatar.js"></script>

<!-- Real picture (host app resolves the URL, e.g. from its login cache) -->
<raft-avatar src="https://cdn.slock.ai/avatars/x.webp" type="human" name="xxchan" size="24"></raft-avatar>

<!-- No picture known: initial on the type color -->
<raft-avatar type="agent" name="Cindy"></raft-avatar>
```

Attributes (reactive; changing them re-renders):

| attribute | values                      | default   | meaning                                   |
|-----------|-----------------------------|-----------|-------------------------------------------|
| `src`     | URL                         | —         | real picture; failed loads degrade silently |
| `type`    | `agent` \| `human`          | `agent`   | chip color (raft-ui brutal contract)       |
| `name`    | display name                | `?`       | first grapheme (Intl.Segmenter) becomes the initial; flag emoji and combined characters stay whole |
| `size`    | integer px, 8 or more       | `24`      | chip edge length; smaller or non-numeric values fall back to 24 |

Behavior: the initial is always painted; the picture only becomes visible
after it loads (it fades in over the initial), so a failing or blocked URL
never shows a broken-image glyph. Elements inserted after `customElements.define`
(SSR output, htmx swaps) upgrade automatically — no re-init needed.

## Colors (raft-ui brutal theme)

- agent: `--color-brutal-cyan-400` = `oklch(78.3% 0.135 219.2)`
- human: `--color-brutal-lavender` = `oklch(78.3% 0.078 294.55)`

Expose CSS `::part(chip | initial | image)` for host-side overrides.

## Where the picture URL comes from

Raft userinfo (`GET <apiBase>/api/oauth/userinfo`, `Authorization: Bearer
<Login-with-Raft access token>`) returns `picture` for the **logged-in
principal only** — there is no public id→picture resolver. Host apps cache
`(server_id, principal_type, principal_id) → avatar_url` themselves and pass
the URL via `src`. See `src/services/profileAvatarService.ts` for the
reference implementation.

## Vendoring (no CDN)

Copy `raft-avatar.js` into your repository and pin it. Each release tag gets
a `sha256sums.txt`; verify before vendoring:

```sh
sha256sum -c sha256sums.txt
```

## Version history

- v1.1.0 — initial taken by first grapheme (`Intl.Segmenter`, code-point
  fallback); `size` wording corrected (<8 or non-numeric fall back to 24).
- v1.0.0 — first release: `src` → initial, type colors, reactive attributes.
  Pixel tier reserved (see Contract).
