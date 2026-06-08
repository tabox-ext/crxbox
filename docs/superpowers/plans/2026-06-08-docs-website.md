# crxbox Documentation Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a VitePress documentation website for `crxbox` on GitHub Pages at `https://tabox-ext.github.io/crxbox/`, built from the project's existing Markdown.

**Architecture:** A VitePress site rooted in the existing `docs/` directory (VitePress's default `srcDir`). Existing Markdown files become site pages — `docs/API.md` is reused as the reference page, guides move into `docs/guides/`, and a new home + getting-started page are adapted from the README. Root `CHANGELOG.md` is copied into the site at build time. A GitHub Actions workflow builds and deploys on push to `master`.

**Tech Stack:** VitePress 1.x, Node 20, GitHub Actions (`actions/upload-pages-artifact` + `actions/deploy-pages`).

---

## File Structure

- `docs/.vitepress/config.ts` — site config: title, base, nav, sidebar, local search, srcExclude. **New.**
- `docs/index.md` — home page (hero + feature cards). **New.**
- `docs/getting-started.md` — install + quickstart, adapted from README. **New.**
- `docs/api.md` — renamed from `docs/API.md`; the reference page. **Moved + link fixups.**
- `docs/guides/fixture-extension.md` — moved from `docs/fixture-extension.md`.
- `docs/guides/dogfood-tabox.md` — moved from `docs/dogfood-tabox.md`.
- `docs/changelog.md` — generated from root `CHANGELOG.md` at build time. **Gitignored.**
- `docs/public/crxbox-logo.png` — site logo, copied from `assets/crxbox-logo.png`. **New.**
- `scripts/copy-changelog.mjs` — copies `CHANGELOG.md` → `docs/changelog.md`. **New.**
- `.github/workflows/docs.yml` — build + deploy to Pages. **New.**
- `package.json` — add `vitepress` devDep + `docs:*` scripts. **Modify.**
- `.gitignore` — ignore VitePress cache/dist + generated changelog. **Modify.**
- `eslint.config.js` — add `docs` to ignores so the config file isn't linted. **Modify.**

---

## Task 1: Install VitePress and add scripts

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `eslint.config.js`

- [ ] **Step 1: Install VitePress as a dev dependency**

Run:
```bash
npm install -D vitepress@^1.0.0
```
Expected: `vitepress` appears under `devDependencies` in `package.json` and `package-lock.json` updates.

> **Memory note (npm registry):** This repo's lockfile must use `npmjs.org` URLs only when committed (local installs may inject Wix registry URLs). After installing, verify and rewrite if needed:
> ```bash
> grep -c "registry.npmjs.org" package-lock.json
> grep -c "wix" package-lock.json    # must be 0 before committing
> ```
> If any Wix URLs appear, rewrite them to `https://registry.npmjs.org` before the commit step.

- [ ] **Step 2: Add docs scripts to `package.json`**

In the `"scripts"` block, add these three entries (each copies the changelog first):
```json
"docs:dev": "node scripts/copy-changelog.mjs && vitepress dev docs",
"docs:build": "node scripts/copy-changelog.mjs && vitepress build docs",
"docs:preview": "node scripts/copy-changelog.mjs && vitepress preview docs"
```

- [ ] **Step 3: Update `.gitignore`**

Append these lines:
```
docs/.vitepress/cache/
docs/.vitepress/dist/
docs/changelog.md
```

- [ ] **Step 4: Update `eslint.config.js` ignores**

Change the ignores line from:
```js
{ ignores: ['dist', 'skill', 'fixtures/ext', 'tests', '*.config.*', 'scripts'] },
```
to:
```js
{ ignores: ['dist', 'skill', 'fixtures/ext', 'tests', '*.config.*', 'scripts', 'docs'] },
```

- [ ] **Step 5: Verify lint and typecheck still pass**

Run:
```bash
npm run lint && npm run typecheck
```
Expected: both PASS (no new errors; `docs` is excluded from lint, `tsconfig` only includes `src`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore eslint.config.js
git commit -m "build(docs): add vitepress dev dependency and docs scripts"
```

---

## Task 2: Changelog copy script

**Files:**
- Create: `scripts/copy-changelog.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/copy-changelog.mjs`:
```js
// Copies the root CHANGELOG.md into the VitePress site as docs/changelog.md.
// CHANGELOG.md stays the single source of truth; docs/changelog.md is gitignored.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'CHANGELOG.md');
const dest = join(root, 'docs', 'changelog.md');

if (!existsSync(src)) {
  console.error(`copy-changelog: source not found at ${src}`);
  process.exit(1);
}
copyFileSync(src, dest);
console.log(`copy-changelog: wrote ${dest}`);
```

- [ ] **Step 2: Run it and verify output**

Run:
```bash
node scripts/copy-changelog.mjs && head -1 docs/changelog.md
```
Expected: prints `copy-changelog: wrote .../docs/changelog.md` then `# Changelog`.

- [ ] **Step 3: Commit**

```bash
git add scripts/copy-changelog.mjs
git commit -m "build(docs): add changelog copy script"
```

---

## Task 3: Move and adapt existing doc pages

**Files:**
- Move: `docs/API.md` → `docs/api.md`
- Move: `docs/fixture-extension.md` → `docs/guides/fixture-extension.md`
- Move: `docs/dogfood-tabox.md` → `docs/guides/dogfood-tabox.md`
- Create: `docs/public/crxbox-logo.png` (copy of `assets/crxbox-logo.png`)

- [ ] **Step 1: Move files with git**

Run:
```bash
mkdir -p docs/guides docs/public
git mv docs/API.md docs/api.md
git mv docs/fixture-extension.md docs/guides/fixture-extension.md
git mv docs/dogfood-tabox.md docs/guides/dogfood-tabox.md
cp assets/crxbox-logo.png docs/public/crxbox-logo.png
git add docs/public/crxbox-logo.png
```
Expected: `git status` shows three renames and one new file.

- [ ] **Step 2: Fix relative links in `docs/api.md`**

`docs/api.md` references the README via relative paths. Find them:
```bash
grep -n "README" docs/api.md
```
For each match, replace the relative README link target with the site route `/getting-started`. For example, change `](../README.md)` → `](/getting-started)` and `](../README.md#consuming-crxbox)` → `](/getting-started)`. Leave the link **text** unchanged. Also fix any `./SKILL.md` / `skill/SKILL.md` reference to point at the GitHub source URL `https://github.com/tabox-ext/crxbox/blob/master/skill/SKILL.md`.

- [ ] **Step 3: Fix cross-links in the moved guides**

Check the guides for links that pointed at sibling docs:
```bash
grep -n "](\.\./\|](\./\|API.md\|fixture-extension\|dogfood" docs/guides/*.md
```
For each match, rewrite to the new site routes: links to the API doc → `/api`, links to the other guide → `/guides/fixture-extension` or `/guides/dogfood-tabox`. Leave external (`http`) links untouched.

- [ ] **Step 4: Commit**

```bash
git add docs/api.md docs/guides docs/public
git commit -m "docs: relocate API + guides into vitepress site tree"
```

---

## Task 4: VitePress config

**Files:**
- Create: `docs/.vitepress/config.ts`

- [ ] **Step 1: Write the config**

Create `docs/.vitepress/config.ts`:
```ts
import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'crxbox',
  description: 'Playwright, but extension-aware. A toolkit for E2E testing Chrome (MV3) extensions.',
  base: '/crxbox/',
  lastUpdated: true,
  cleanUrls: true,
  // Brainstorming specs live under docs/superpowers — never ship them.
  srcExclude: ['superpowers/**', '**/README.md'],
  head: [
    ['link', { rel: 'icon', href: '/crxbox/crxbox-logo.png' }],
  ],
  themeConfig: {
    logo: '/crxbox-logo.png',
    search: { provider: 'local' },
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'Guides', link: '/guides/fixture-extension' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API', link: '/api' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Fixture extension', link: '/guides/fixture-extension' },
          { text: 'Dogfooding with tabox', link: '/guides/dogfood-tabox' },
        ],
      },
      {
        text: 'Changelog',
        items: [
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/tabox-ext/crxbox' },
    ],
    editLink: {
      pattern: 'https://github.com/tabox-ext/crxbox/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add docs/.vitepress/config.ts
git commit -m "docs: add vitepress site config"
```

---

## Task 5: Home and Getting Started pages

**Files:**
- Create: `docs/index.md`
- Create: `docs/getting-started.md`

- [ ] **Step 1: Write the home page**

Create `docs/index.md` (VitePress home layout). Logo is served from `docs/public/`:
```markdown
---
layout: home
hero:
  name: crxbox
  text: Playwright, but extension-aware
  tagline: A lightweight toolkit for end-to-end testing Chrome (MV3) extensions. Zero runtime dependencies — Playwright is a peer you provide.
  image:
    src: /crxbox-logo.png
    alt: crxbox
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: API Reference
      link: /api
    - theme: alt
      text: View on GitHub
      link: https://github.com/tabox-ext/crxbox
features:
  - title: Real extension, real browser
    details: Drives the actual installed extension in a real Chromium — not mocked chrome.* APIs. Catches the bugs mocks hide.
  - title: First-class extension surfaces
    details: Helpers for the popup, content-script UI (Shadow DOM / iframes / injection timing), the MV3 service worker (including forced restart), storage, and the extension ID / URLs.
  - title: A thin layer on Playwright
    details: You keep all of Playwright — locators, assertions, traces, parallelism. crxbox just ships the extension-specific parts so you stop hand-rolling that 150-line fixtures file.
  - title: Diagnostic errors
    details: CrxboxError with a machine-readable diagnostic.code (e.g. content-ui/not-injected) and a fix hint, instead of a vague TimeoutError.
---
```

- [ ] **Step 2: Write the getting-started page**

Create `docs/getting-started.md`. Adapt the install + quickstart content from the README's opening and "Consuming crxbox" sections. Use this content:
```markdown
# Getting Started

crxbox is a thin layer of fixtures and helpers on top of
[`@playwright/test`](https://playwright.dev). It does **not** replace Playwright
or build your extension — it adds first-class APIs for the surfaces Playwright
doesn't understand: the **popup**, **content-script UI**, the **background
service worker**, **storage**, and the **extension ID / URLs**.

## Install

crxbox has zero runtime dependencies of its own. Playwright is a peer dependency
you provide, and Chromium is installed via Playwright.

```bash
npm install -D crxbox @playwright/test
npx playwright install chromium
```

## Quickstart

```ts
import { test, expect } from 'crxbox';

test.use({ extensionPath: './dist' });

test('save the current tab from the popup', async ({ ext, page }) => {
  await page.goto('https://example.com');
  const popup = await ext.popup.open();                 // opens your manifest's default_popup
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(ext.storage.local).toHaveStorageValue('saved', expect.anything());
});
```

`test.use({ extensionPath })` points crxbox at your built, unpacked extension
(the directory containing `manifest.json`). From there, the `ext` fixture gives
you the extension-aware helpers.

## Next steps

- [API Reference](/api) — every method on the `ext` fixture, the matchers, and error codes.
- [Fixture extension guide](/guides/fixture-extension) — the test extension crxbox uses.
- [Dogfooding with tabox](/guides/dogfood-tabox) — a real-world usage walkthrough.
```

> **Note:** The triple-backtick fences inside the Markdown above must be written literally into the file (this plan nests them for display). Confirm the file's code fences render by previewing in Task 7.

- [ ] **Step 3: Commit**

```bash
git add docs/index.md docs/getting-started.md
git commit -m "docs: add home and getting-started pages"
```

---

## Task 6: Build verification (dead-link check)

**Files:** none (verification only)

- [ ] **Step 1: Build the site**

Run:
```bash
npm run docs:build
```
Expected: build completes with `build complete` and **no dead-link errors**. VitePress fails the build on broken internal links — treat any reported dead link as a task to fix (return to Task 3/5 and correct the link target), then rebuild.

- [ ] **Step 2: Preview and eyeball**

Run:
```bash
npm run docs:preview
```
Open the printed local URL. Verify: home hero + logo render, top nav works, sidebar groups appear, the API page loads fully, both guides load, the changelog page shows the changelog, and local search returns results.

- [ ] **Step 3: Stop the preview**

Press `Ctrl+C`.

No commit (this task only verifies; the generated `docs/changelog.md` and `docs/.vitepress/dist` are gitignored).

---

## Task 7: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/docs.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/docs.yml`:
```yaml
name: docs
on:
  push:
    branches: [master]
    paths:
      - 'docs/**'
      - 'README.md'
      - 'CHANGELOG.md'
      - '.github/workflows/docs.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Allow one concurrent deployment, cancel in-progress runs of the same group.
concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run docs:build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "ci(docs): build and deploy vitepress site to github pages"
```

- [ ] **Step 3: MANUAL — enable Pages source**

This step cannot be automated from the repo. In **GitHub → repo Settings → Pages**, set **Source = "GitHub Actions"**. Until this is done, the `deploy` job will fail with a Pages-not-enabled error — that is expected.

- [ ] **Step 4: Push and watch the workflow**

After pushing `master`, watch the run:
```bash
git push origin master
gh run watch
```
Expected: both `build` and `deploy` jobs succeed; `deploy` prints the `page_url` (`https://tabox-ext.github.io/crxbox/`). Open it and confirm the site loads with assets resolving under `/crxbox/`.

---

## Task 8: Link the site from the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a docs-site link near the top of the README**

Just under the opening blockquote/tagline in `README.md`, add a line pointing at the live site:
```markdown
📚 **Documentation site: [tabox-ext.github.io/crxbox](https://tabox-ext.github.io/crxbox/)**
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: link to the documentation site from the README"
```

---

## Self-Review Notes

- **Spec coverage:** Generator (Task 1), docs/ location + reuse of API.md (Task 3), home/getting-started/api/guides/changelog pages (Tasks 2/3/5), local search + base path (Task 4), GitHub Actions deploy + manual Pages step (Task 7), dead-link build check (Task 6), srcExclude of superpowers (Task 4). All spec sections map to a task.
- **CI safety:** `docs` added to eslint ignores (Task 1 Step 4); `tsconfig` already only includes `src`, so `typecheck` is unaffected; the existing `ci.yml` does not run docs scripts, so it stays green.
- **Lockfile memory:** Task 1 Step 1 includes the npmjs.org-only lockfile guard required for this repo.
