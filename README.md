# crxbox

> **Playwright, but extension-aware.** A lightweight toolkit for end-to-end testing Chrome (MV3) extensions — **zero runtime dependencies of its own** (Playwright is a peer dependency you provide; Chromium is installed via Playwright).

crxbox is a thin layer of fixtures and helpers on top of [`@playwright/test`](https://playwright.dev). It does **not** replace Playwright or build your extension — it adds first-class APIs for the surfaces Playwright doesn't understand: the **popup**, **content-script UI** (Shadow DOM / iframes / injection timing), the **background service worker** (including forced restart), **storage**, and the **extension ID / URLs**.

```ts
import { test, expect } from 'crxbox';

test.use({ extensionPath: './dist' });

test('save the current tab from the popup', async ({ ext, page }) => {
  await page.goto('https://example.com');
  const popup = await ext.popup.open();                         // opens your manifest's default_popup
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(ext.storage.local).toHaveStorageValue('saved', expect.anything());
});
```

📖 **[Full API reference & all available methods → `docs/API.md`](docs/API.md)**

---

## Requirements

- **Node 18+**
- **`@playwright/test`** (peer dependency)
- **Chromium** — installed via Playwright (`npx playwright install chromium`). Extensions only load in Playwright's bundled Chromium, in a persistent context. crxbox handles the launch for you.
- **Your extension built to an unpacked folder** — a directory containing `manifest.json` (e.g. `dist/`). crxbox loads it; it does not build it.
- crxbox is **ESM-only**.

## Install

Use whichever package manager your project uses — **npm** or **yarn**:

```bash
# npm
npm i -D crxbox @playwright/test
npx playwright install chromium
```
```bash
# yarn
yarn add -D crxbox @playwright/test
yarn playwright install chromium
```

> **Not yet published to npm?** While crxbox is local-only, install it from disk instead of the registry (build it once first with `npm run build` in the crxbox repo):
> ```bash
> # npm
> npm i -D /path/to/crxbox @playwright/test && npx playwright install chromium
> ```
> ```bash
> # yarn
> yarn add -D file:/path/to/crxbox @playwright/test && yarn playwright install chromium
> ```

## Getting started

### 1. Point crxbox at your build

One option, `extensionPath` — the folder containing `manifest.json`. Set it per-file:

```ts
import { test } from 'crxbox';
test.use({ extensionPath: './dist' });
```

…or project-wide in `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { extensionPath: './dist' } as any, // crxbox fixture option
});
```

### 2. Write a test

```ts
// e2e/extension.spec.ts
import { test, expect } from 'crxbox';

test.use({ extensionPath: './dist' });

test('popup renders', async ({ ext }) => {
  const popup = await ext.popup.open();
  await expect(popup.getByRole('button', { name: 'Save' })).toBeVisible();
});

test('background responds to a message', async ({ ext }) => {
  const res = await ext.background.sendMessage({ type: 'PING' });
  expect(res).toEqual({ type: 'PONG' });
});

test('injected content UI works inside a Shadow root', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');
  const ui = await ext.contentUi(page, { root: '[data-ext-root]', shadow: true });
  await ui.getByRole('button', { name: 'Save' }).click();
  await expect(ext.storage.local).toHaveStorageValue('saved', expect.anything());
});

test('state survives a forced service-worker restart', async ({ ext, context }) => {
  await ext.background.evaluate(() => chrome.storage.local.set({ kept: 'yes' }));
  await ext.background.kill();                          // forced MV3 termination via CDP
  const page = await context.newPage();                // a real event wakes the worker
  await page.goto(ext.url('popup.html'));
  await page.evaluate(() => chrome.runtime.sendMessage({ type: 'PING' }));
  const kept = await ext.background.evaluate(async () => (await chrome.storage.local.get('kept')).kept);
  expect(kept).toBe('yes');
});
```

### 3. Run

```bash
npx playwright test
```

## The `ext` fixture at a glance

Every test receives `ext`, your extension-aware handle:

| Area | API | Notes |
|------|-----|-------|
| **ID / URL** | `ext.id` · `ext.url('page.html')` | The 32-char extension ID and `chrome-extension://…` URL builder. |
| **Popup** | `ext.popup.open()` · `ext.popup.openForTab(page)` | `open()` defaults to the manifest's `action.default_popup`. `openForTab` is best-effort (Chrome 127+, headed). |
| **Content UI** (flagship) | `await ext.contentUi(page, { root, shadow?, frame? })` | Awaits injection; pierces open Shadow DOM; scopes into iframes; then `.getByRole/.getByText/.locator`. |
| **Background / SW** | `ext.background.evaluate / sendMessage / waitForReady / kill()` | Evaluate in the worker, message it, and **forcibly restart** it to test MV3 resilience. |
| **Storage** | `ext.storage.local\|sync\|session` `.get/.set/.clear` + `toHaveStorageValue` | Auto-reset between tests. |

See **[`docs/API.md`](docs/API.md)** for full signatures, options, return types, patterns, and limitations.

## Structured, machine-readable failures

When a crxbox wait fails, it throws a `CrxboxError` carrying a `diagnostic` with a stable, namespaced `code` (e.g. `content-ui/not-injected`) plus context — instead of a vague timeout:

```
content-ui readiness timeout
  crxbox: {"code":"content-ui/not-injected","root":"[data-ext-root]","expectedFrame":"main","sawFrames":["main"],"waitedMs":5000}
  hint: the root selector never appeared in the expected frame — check the content script matches/run_at, or pass { frame } if it injects into an iframe.
```

Read `err.diagnostic.code` to branch programmatically. The full code → meaning → fix table is in [`docs/API.md`](docs/API.md#error-handling).

## Bring your own Playwright (composable fixtures)

Prefer to merge crxbox into your own `test`? Use `createExtensionFixtures`:

```ts
import { test as base } from '@playwright/test';
import { createExtensionFixtures } from 'crxbox';

export const test = base.extend(createExtensionFixtures({ path: './dist' }));
export const expect = test.expect;
```

## For AI coding agents

crxbox ships a token-efficient skill file at **`node_modules/crxbox/skill/SKILL.md`** — the full API surface, canonical patterns, failure-code table, and anti-patterns in one file an agent can read to write correct tests without scanning source.

## Scope

**In v1:** loader + deterministic-ID/URL, popup, content-UI (flagship), background/service-worker (incl. forced kill), storage + matcher, structured diagnostics.

**Not in v1 (roadmap):** message spy, cross-context trace viewer, side-panel support, an extension-aware recorder, and a live MCP server. See the design spec under `docs/superpowers/specs/`.

## License

MIT
