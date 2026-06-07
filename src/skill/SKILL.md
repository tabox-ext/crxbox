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
- **Popup:** `await ext.popup.open()` → Page (logic/UI, the reliable default, ~90%). With no arg it auto-resolves the popup path from the manifest's `action.default_popup`; pass a path to override. `await ext.popup.openForTab(page)` → verify active-tab wiring; best-effort only (needs Chrome 127+, a focused window, flaky in new headless) — prefer `open()`.
- **Content-UI (flagship):** `const ui = await ext.contentUi(page, { root, shadow?, frame?, timeout? })` — it is awaited; awaiting waits for the root to be injected. Then `ui.getByRole(...)` / `ui.getByText(...)` / `ui.locator(...)`. `shadow` documents intent only (Playwright always pierces open shadow DOM); use `frame` for iframe-hosted UI.
- **Background/SW:** `await ext.background.evaluate(fn, arg)`, `.sendMessage(msg)` (sent from a real extension page, returns the SW response), `.waitForReady()`, `.kill()` (forced CDP termination — assert state survives a restart).
- **Storage:** `ext.storage.local|sync|session` with `.get(key)` / `.set(obj)` / `.clear()`. Auto-reset between tests. Matcher: `await expect(ext.storage.local).toHaveStorageValue(key, expected)` (supports `expect.arrayContaining`/`objectContaining`).

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
| `popup/no-active-tab` | pass the navigated page to `openForTab`; don't steal focus. |
| `content-ui/not-injected` | check content-script `matches`/`run_at`; pass `{ frame }` for iframe UI. |
| `content-ui/wrong-frame` | fix the `{ frame }` selector to match the hosting iframe. |
| `background/restart-timeout` | SW crashing on startup — check its console. |
| `background/eval-failed` | the SW has no DOM; see `cause`. |
| `storage/key-absent` | confirm the write and the area (local/sync/session). |

## Anti-patterns
- Never `page.waitForTimeout(...)` — every crxbox helper auto-waits.
- For async/fire-and-forget storage writes, use `expect.poll`, not `toHaveStorageValue`.
- Use `openForTab` (not raw `open('popup.html')`) only when verifying which tab the popup acts on; `open()` is the default.
- Read `err.diagnostic.code` to self-correct; don't parse the human message.
