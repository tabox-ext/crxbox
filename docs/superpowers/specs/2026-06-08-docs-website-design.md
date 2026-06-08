# Design: crxbox documentation website (GitHub Pages)

**Date:** 2026-06-08
**Status:** Approved — ready for implementation plan

## Goal

Publish a documentation website for `crxbox` on the repo's GitHub Pages, built
from the project's existing Markdown docs. Served at
`https://tabox-ext.github.io/crxbox/`.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Generator | **VitePress** (Vue-based, Markdown-first) |
| Content strategy | Reorganize existing Markdown into a site tree; reuse big files as-is |
| Site location | The existing **`docs/`** directory (VitePress default `srcDir`) |
| Deployment | **GitHub Actions** on push to `master`; Pages source = "GitHub Actions" |
| URL / base path | Default github.io URL → `base: '/crxbox/'` |
| Pages included | Getting Started, API Reference, Guides, Changelog |
| Search | VitePress built-in **local** search (no external service) |

## Architecture & file layout

```
docs/
  .vitepress/
    config.ts            # nav, sidebar, theme, base: '/crxbox/', local search, srcExclude
  index.md               # NEW — home page (hero + feature cards), adapted from README
  getting-started.md     # NEW — install + quickstart, adapted from README
  api.md                 # = current docs/API.md (renamed lowercase), shared source of truth
  guides/
    fixture-extension.md # moved from docs/fixture-extension.md
    dogfood-tabox.md     # moved from docs/dogfood-tabox.md
  changelog.md           # GENERATED at build time from root CHANGELOG.md (gitignored)
  superpowers/           # EXCLUDED from the site via srcExclude
```

- `docs/API.md` becomes `docs/api.md` — the existing 34KB reference is reused
  verbatim except for relative-link fixups (its `../README.md` links → site
  routes like `/getting-started`).
- `docs/superpowers/` (brainstorming specs) is excluded via `srcExclude` so it
  never ships.

## Content & navigation

- **Home (`index.md`)**: VitePress `layout: home` hero — logo
  (`assets/crxbox-logo.png`), tagline ("Playwright, but extension-aware"), CTA
  buttons (Get Started → `/getting-started`, View on GitHub), and feature cards
  derived from the README's "Why crxbox" comparisons.
- **Top nav**: Getting Started · API · Guides · Changelog · GitHub link.
- **Sidebar** (grouped):
  - *Introduction*: Getting Started
  - *Reference*: API
  - *Guides*: Fixture extension, Dogfooding with tabox
  - *Changelog*
- **Search**: VitePress built-in local search.

## Changelog handling

Root `CHANGELOG.md` stays the single source of truth. A small npm script copies
it to `docs/changelog.md` before every build (locally and in CI).
`docs/changelog.md` is added to `.gitignore` so there is no committed drift.

## Build & deploy

- **New dev dependency**: `vitepress`.
- **New npm scripts** (each runs the changelog-copy step first):
  - `docs:dev` — local dev server
  - `docs:build` — production build
  - `docs:preview` — preview the built site
- **New workflow** `.github/workflows/docs.yml`:
  - Trigger: push to `master`, paths-filtered to `docs/**`, `README.md`,
    `CHANGELOG.md`, and the workflow file itself; plus `workflow_dispatch`.
  - Steps: checkout → setup Node → `npm ci` → `npm run docs:build` →
    `actions/upload-pages-artifact` → `actions/deploy-pages`.
  - Permissions: `pages: write`, `id-token: write`.
- **`base: '/crxbox/'`** so assets/links resolve under the project subpath.

### Manual one-time step (flagged, not automatable here)

In GitHub repo **Settings → Pages**, set **Source = "GitHub Actions"**. The
deploy job will fail until this is done; this is expected and called out in the
implementation plan.

## Testing / verification

- `npm run docs:build` succeeds with **no dead-link errors** (VitePress fails
  the build on broken internal links — this is the primary automated check).
- `npm run docs:preview` to manually eyeball Home, API, and Guides pages render
  correctly (logo loads, nav/sidebar work, search works).

## Out of scope (YAGNI)

- Custom domain / DNS (default github.io URL for now; trivial to migrate later).
- Doc versioning, blog, i18n.
- API docs auto-generated from TypeScript types (the hand-written `API.md` is
  the source).
