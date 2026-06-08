---
name: crxbox
description: Use when writing or debugging Chrome-extension tests with crxbox — covers loader/ID, popup, content-UI, background/service-worker, and storage helpers on top of Playwright.
---

# crxbox — testing Chrome extensions

Extension-aware fixtures on top of Playwright. One import, auto-waiting helpers,
structured failures. ESM-only, Node 18+.

## Setup
```ts
import { test, expect } from 'crxbox';
test.use({ extensionPath: './dist' }); // or set in playwright.config project `use`
```
Composable form: `base.extend(createExtensionFixtures({ path: './dist' }))`.

## Helpers (`ext` fixture)
- **ID/URL:** `ext.id`, `ext.url('popup.html')`.
- **Popup:** `await ext.popup.open(popupPath?, opts?)` → Page (logic/UI, the reliable default, ~90%). With no arg it auto-resolves the popup path from the manifest's `action.default_popup`; pass a path to override. `opts.viewport` sizes the page; fixture option `popupViewport` sets a project-wide default. `await ext.popup.openForTab(page)` → verify active-tab wiring; best-effort only (needs Chrome 127+, a focused window, flaky in new headless) — prefer `open()`. `openForTab` does NOT accept a `viewport` option.
- **Open any extension page:** `await ext.openPage(path, opts?)` → Page. Neutral sibling of `popup.open()` for options pages, full-page views, sandbox pages. Accepts `{ viewport }`.
- **Content-UI (flagship):** `const ui = await ext.contentUi(page, { root, shadow?, frame?, timeout? })` — it is awaited; awaiting waits for the root to be injected. Then `ui.getByRole(...)` / `ui.getByText(...)` / `ui.locator(...)`. `shadow` documents intent only (Playwright always pierces open shadow DOM); use `frame` for iframe-hosted UI.
- **Background/SW:** `await ext.background.evaluate(fn, arg)`, `.sendMessage(msg)` (sent from a real extension page, returns the SW response), `.waitForReady()`, `.kill()` (forced CDP termination — assert state survives a restart).
- **Storage:** `ext.storage.local|sync|session` with `.get(key)` / `.set(obj)` / `.clear()`. Auto-reset between tests. `get(key)` returns the unwrapped value (not `{ key: value }`). Matcher: `await expect(ext.storage.local).toHaveStorageValue(key, expected)` (supports `expect.arrayContaining`/`objectContaining`).
- **Accept dialogs:** `ext.acceptDialogs(page)` — auto-accepts every `confirm`/`alert`/`prompt` on the page; returns a disposer `() => void` to detach. (Prompts are accepted with their default value; for custom prompt text use your own `page.on('dialog', d => d.accept('text'))`.)
- **Drag-and-drop:** `await ext.dragAndDrop(source, target, opts?)` — robust pointer DnD (press → nudge → stepped glide → settle → release). `opts`: `{ steps?: number (12), nudge?: number (8), settle?: number (4) }`. Use this instead of `locator.dragTo()` when sensors have an activation distance.
- **Simulate update** *(experimental)*: `await ext.simulateUpdate(opts?)` — fires `chrome.runtime.onInstalled` to test update/migration logic. `opts`: `{ reason?: string (default `'update'`), previousVersion?: string }`. Relies on a Chromium event-binding internal (`onInstalled.dispatch`); version-sensitive — throws `simulate-update/unavailable` if absent. **Robust fallback:** seed pre-update storage (`await ext.storage.local.set({ schemaVersion: '1.x', ...legacyData })`), drive the migration entry point directly (`ext.background.sendMessage({ type: 'RUN_MIGRATION' })` or `ext.background.evaluate(...)`), then assert with `toEventuallyHaveStorageValue`. Prefer this fallback when you have no hard `onInstalled` dependency.

## Canonical pattern
```ts
test('save from injected button', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');
  const ui = await ext.contentUi(page, { root: '[data-ext-root]', shadow: true });
  await ui.getByRole('button', { name: 'Save' }).click();
  await expect(ext.storage.local).toHaveStorageValue('saved', expect.arrayContaining([
    expect.objectContaining({ url: expect.stringContaining('example.com') }),
  ]));
});
```

## Async write-through gotcha
`toHaveStorageValue` does a single read — it does NOT poll. If the click fires a
fire-and-forget `chrome.runtime.sendMessage` that writes storage asynchronously, the
read can race the write. Poll instead:
```ts
await expect.poll(() => ext.storage.local.get('saved')).toEqual(/* … */);
```
Use the matcher only when the write has already completed (e.g. an awaited round-trip).

## Failure codes (`CrxboxError.diagnostic.code`)
| code | fix |
|------|-----|
| `loader/build-not-found` | point `extensionPath` at a dir with `manifest.json`. |
| `loader/sw-timeout` | check `background.service_worker` in the manifest. |
| `loader/duplicate-playwright` | two `@playwright/test` copies on disk — consume crxbox as a published/packed tarball, not a live symlink; dedupe to one copy. |
| `popup/no-active-tab` | pass the navigated page to `openForTab`; don't steal focus. |
| `content-ui/not-injected` | check content-script `matches`/`run_at`; pass `{ frame }` for iframe UI. |
| `content-ui/wrong-frame` | fix the `{ frame }` selector to match the hosting iframe. |
| `background/restart-timeout` | SW crashing on startup — check its console. |
| `background/eval-failed` | the SW has no DOM; see `cause`. |
| `storage/key-absent` | confirm the write and the area (local/sync/session). |
| `drag/no-bounding-box` | source or target not visible/attached — ensure the locator resolves before dragging. |
| `drag/cross-page` | source and target are on different pages — `dragAndDrop` is single-page only. |
| `simulate-update/unavailable` | `onInstalled.dispatch` absent in this Chrome build — use the seed-and-drive fallback instead. |

## Gotchas

### §1 — Consumption contract: one `@playwright/test` instance
crxbox must share the consumer's single `@playwright/test` copy. A **live symlink** (yarn `portal:`/`link:`) to a dev checkout that ships its own `node_modules` breaks with Playwright's "Requiring @playwright/test second time" crash; crxbox emits `loader/duplicate-playwright` when it detects this.

Supported consumption methods:
- Publish to a registry and install normally.
- `npm pack` → `file:` tarball install (tarball has no `node_modules`).
- Deduplicate so only one `@playwright/test` copy exists on disk.

### §2 — CommonJS host
If the host `package.json` is `"type": "commonjs"`, name your config and spec files `.mjs` / `.mts` (or set `"type": "module"`) so crxbox loads as real ESM and avoids an `ERR_REQUIRE_ESM`-class failure. Example: `playwright.config.mjs`, `e2e/popup.spec.mjs`.

### §4 — Launch config forwarding
`headless` / `--headed`, `PWDEBUG`, `channel`, `slowMo`, and `use.launchOptions` are honored automatically. Caller `args` are **appended** to crxbox's two required extension flags — not replaced.

### §5 — Popup fidelity
`popup.open()` is popup-as-page at the default viewport (1280×720). For layout-sensitive assertions, pass `{ viewport: { width, height } }` or set `popupViewport` via `test.use(...)` to mimic a real action popup's small dimensions. Viewport resolution order: per-call `opts.viewport` → fixture `popupViewport` → Playwright default.

`openForTab()` does **not** accept a `viewport` option — Chrome controls the real popup window bounds.

### §6 — Storage: `get(key)` returns the unwrapped value
`get('myKey')` returns the value directly (e.g. an array), **not** the `{ myKey: value }` wrapper that `chrome.storage` returns natively. Seed app state before opening the popup:

```ts
await ext.storage.local.set({ theme: 'dark', items: [{ id: 1 }] });
const popup = await ext.popup.open();
await expect(popup.getByTestId('theme-toggle')).toHaveAttribute('data-value', 'dark');
```

### §7 — Dialogs
Playwright **auto-dismisses** unhandled dialogs (`confirm()` → false), silently aborting destructive actions. Call `ext.acceptDialogs(page)` before clicking a confirmation button, then use `expect.poll` (not `toHaveStorageValue`) for the resulting async write:

```ts
const detach = ext.acceptDialogs(popup);
await popup.getByRole('button', { name: 'Delete All' }).click();
await expect.poll(() => ext.storage.local.get('items')).toEqual([]);
detach();
```

### §8 — Drag-and-drop
`locator.dragTo()` issues a single move event and won't reliably trip activation-distance sensors (dnd-kit, react-dnd, etc.). Use `ext.dragAndDrop(source, target)` instead:

```ts
await ext.dragAndDrop(
  popup.locator('[data-drag-handle]').first(),
  popup.locator('[data-drop-slot="2"]'),
);
```

### §11 — Helper / extension-shape matrix
Not all helpers apply to every extension shape:

| Helper | Applies to |
|--------|-----------|
| `popup.open`, `storage`, `background` | Popup-only extensions |
| `contentUi` | Content-script UI (shadow DOM, iframe) |
| `openPage` | Options pages, full-page views, sandbox pages |

The `fixtures/ext/` sample extension ships a content script, so `contentUi` has first-party test coverage independent of any adopted app.

### §13 — `openPage` — neutral page opener
Use `ext.openPage(path, opts?)` to open options pages or other extension pages without the popup-specific connotations of `popup.open()`:

```ts
const options = await ext.openPage('options.html');
const sandboxed = await ext.openPage('sandbox.html', { viewport: { width: 800, height: 600 } });
```

### §15 — Testability boundaries
Two known limits beyond crxbox's current reach:

1. **Window-bound tab operations.** "Save the current window's tabs" or similar features that depend on the popup being bound to a real browsing window can't be driven faithfully with `popup.open()` — the popup-as-page isn't attached to a real window. Use `openForTab()` for those, accepting its best-effort constraints.
2. **Extension-update migrations.** Load-time data-repair routines gated behind an extension version bump (the browser's extension-update flow) are now reachable via `ext.simulateUpdate()` (experimental, version-sensitive) or the seed-and-drive fallback pattern.

## Anti-patterns
- Never `page.waitForTimeout(...)` — every crxbox helper auto-waits.
- For async/fire-and-forget storage writes, use `expect.poll`, not `toHaveStorageValue`.
- Use `openForTab` (not raw `open('popup.html')`) only when verifying which tab the popup acts on; `open()` is the default.
- Don't use `locator.dragTo()` for dnd-kit / react-dnd — use `ext.dragAndDrop(source, target)`.
- Read `err.diagnostic.code` to self-correct; don't parse the human message.
