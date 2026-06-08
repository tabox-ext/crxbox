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

## Why crxbox?

### vs. plain Playwright

Playwright *can* drive extensions — but it isn't extension-aware, so you hand-roll the same ~150-line fixtures file every project and re-discover the same sharp edges. crxbox is a thin layer **on top of** Playwright (you keep all of it — locators, assertions, traces, parallelism, the trace viewer) that ships the extension-specific parts as first-class helpers:

| You'd hand-roll in plain Playwright | crxbox gives you |
|---|---|
| Persistent-context launch flags, `--load-extension`, channel setup | `test.use({ extensionPath })` — one line |
| Parse the extension ID out of the service-worker URL | `ext.id`, `ext.url('page.html')` |
| Open `chrome-extension://…/popup.html` and reason about the active tab | `ext.popup.open()` (auto-resolves the manifest popup) / `openForTab()` |
| Guess *when* a content script injected; pierce Shadow DOM / iframes by hand | `await ext.contentUi(page, { root, shadow?, frame? })` — waits for injection, scopes for you |
| No built-in way to **forcibly** restart an MV3 service worker | `ext.background.kill()` (CDP-forced) — assert state survives a restart |
| `serviceWorker.evaluate` plumbing to read `chrome.storage` | `ext.storage.local/sync/session` + `toHaveStorageValue`, auto-reset between tests |
| Vague `TimeoutError` when injection/registration fails | `CrxboxError` with a machine-readable `diagnostic.code` (e.g. `content-ui/not-injected`) and a fix hint |

If you already have that fixtures file and love maintaining it, crxbox just deletes it. Nothing is locked in — `createExtensionFixtures()` composes into your own `test`.

### vs. Storybook (and other component-level tools)

Storybook is a **component workbench** — it renders your UI components in isolation against *mocked* data and a stubbed environment. That's great for building and visually reviewing components, but it can't prove your extension actually *works*, because it never runs the real thing:

| | Storybook | crxbox |
|---|---|---|
| What runs | A component, in isolation, with mocked `chrome.*` | The **real, installed extension** in a real Chromium |
| `chrome.*` APIs, permissions | Mocked / stubbed | Real runtime |
| Background service worker (incl. MV3 suspend/restart) | ✗ | ✓ (evaluate, message, forced `kill()`) |
| Content script actually injected into a host page (timing, Shadow DOM, iframe, SPA nav) | ✗ | ✓ (flagship) |
| Toolbar popup against the active tab | ✗ | ✓ |
| `chrome.storage` lifecycle, cross-context message flow | ✗ | ✓ |

They operate at **different layers and are complementary**: use Storybook (or Vitest/Jest with mocks) for fast, isolated component and unit work; use crxbox for end-to-end proof that the extension behaves correctly when actually loaded in the browser. crxbox is the layer that catches the bugs mocks hide — injection races, lost service-worker state, permission and active-tab wiring.

---

## Consuming crxbox

**crxbox must share your project's single `@playwright/test` instance** (it is a peer dependency, not a bundled dependency). Install both together:

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
```bash
# pnpm
pnpm add -D crxbox @playwright/test
pnpm playwright install chromium
```

> **Not yet published to npm?** Install from a packed tarball — run `npm pack` in the crxbox repo once, then point at the resulting `.tgz` file:
> ```bash
> npm i -D /path/to/crxbox-0.2.0.tgz @playwright/test && npx playwright install chromium
> ```
> A tarball has no `node_modules` of its own, so it shares your project's `@playwright/test` copy. **Do not** use a live dev-checkout symlink (`file:` path pointing at the crxbox working tree) — that ships crxbox's own `node_modules` and triggers the `loader/duplicate-playwright` crash.

---

## Requirements

- **Node 18+**
- **`@playwright/test`** (peer dependency)
- **Chromium** — installed via Playwright (`npx playwright install chromium`). Extensions only load in Playwright's bundled Chromium, in a persistent context. crxbox handles the launch for you.
- **Your extension built to an unpacked folder** — a directory containing `manifest.json` (e.g. `dist/`). crxbox loads it; it does not build it.
- crxbox is **ESM-only**. If your project's `package.json` is `"type": "commonjs"`, name your Playwright config and spec files `.mjs` / `.mts` (e.g. `playwright.config.mjs`, `e2e/popup.spec.mjs`), or set `"type": "module"`, so crxbox loads as real ESM.
- **One `@playwright/test` instance.** crxbox and your project must share the same resolved copy of `@playwright/test`. Consume crxbox as a published or `npm pack`ed tarball — not a live dev-checkout symlink that ships its own `node_modules`. crxbox emits `loader/duplicate-playwright` if it detects a duplicate. See [`skill/SKILL.md` §1–2](skill/SKILL.md) for details.

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
| **Popup** | `ext.popup.open(path?, opts?)` · `ext.popup.openInWindow(win, path?)` · `ext.popup.openForTab(page)` | `open()` defaults to the manifest's `action.default_popup`. `openInWindow(win)` places the popup inside a seeded window — the headless path for "save current window's tabs" flows. `openForTab` is best-effort (Chrome 127+, headed). |
| **Extension pages** | `ext.openPage(path, opts?)` | Opens options pages, full-page views, and sandbox pages as a normal `Page`. Accepts `{ viewport }`. |
| **Content UI** (flagship) | `await ext.contentUi(page, { root, shadow?, frame? })` | Awaits injection; pierces open Shadow DOM; scopes into iframes; then `.getByRole/.getByText/.locator`. |
| **Background / SW** | `ext.background.evaluate / sendMessage / waitForReady / kill()` | Evaluate in the worker, message it, and **forcibly restart** it to test MV3 resilience. |
| **Windows** | `ext.windows.create(opts?)` | Opens a real browser window seeded with known tabs; returns `WindowHandle { id, tabs: Page[], focus(), close() }`. Unlocks active-tab / "save current window" flows. |
| **Tabs** | `ext.tabs.create / query / close` | Open, query, and close browser tabs; `create` returns a `Page`, `query` returns serializable `TabInfo[]`. |
| **Storage** | `ext.storage.local\|sync\|session` `.get/.set/.clear` + `toHaveStorageValue` / `toEventuallyHaveStorageValue` / `toHaveStorageKeys` | Auto-reset between tests. `get(key)` returns the unwrapped value (not `{ key: value }`). |
| **Dialogs** | `ext.acceptDialogs(page)` | Auto-accepts `confirm`/`alert`/`prompt`; returns a disposer. Playwright otherwise dismisses dialogs, silently aborting destructive actions. |
| **Drag-and-drop** | `ext.dragAndDrop(source, target, opts?)` | Robust pointer DnD that trips activation-distance sensors (dnd-kit, react-dnd). Use instead of `locator.dragTo()`. |
| **Update / migration** *(experimental)* | `ext.simulateUpdate(opts?)` | Fires `chrome.runtime.onInstalled` to exercise update/migration logic. Version-sensitive; see fallback recipe in the API docs. |

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

## Debugging

```bash
npx playwright test --headed                  # watch tests run in a real browser window
PWDEBUG=1 npx playwright test                 # open Playwright Inspector (step through each action)
npx playwright test --trace on && npx playwright show-trace  # record a trace and open the viewer
```

crxbox forwards `--headed` / `PWDEBUG` / `channel` / `slowMo` from your Playwright config automatically — `use.launchOptions.slowMo` slows every action for easier observation.

## Reference

- **[`docs/API.md`](docs/API.md)** — complete API reference (all helpers, options, types, error codes)
- **[`docs/fixture-extension.md`](docs/fixture-extension.md)** — annotated walkthrough of the built-in example extension (`fixtures/ext/`) and its integration tests — copy it as a starting point

## Scope

**In v1:** loader + deterministic-ID/URL, popup, content-UI (flagship), background/service-worker (incl. forced kill), storage + matcher, windows/tabs helpers, structured diagnostics.

**Not in v1 (roadmap):** message spy, cross-context trace viewer, side-panel support, an extension-aware recorder, and a live MCP server. See the design spec under `docs/superpowers/specs/`.

## License

MIT
