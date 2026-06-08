# Fixture extension reference

crxbox ships a complete MV3 example extension at `fixtures/ext/` and exercises it with a matching set of integration tests under `tests/integration/`. The extension is a real, loadable Chrome extension — not a mock — and its tests run against an actual Chromium instance, making it the first-party proof that crxbox's helpers work end-to-end.

Use it as a **copy-and-adapt reference** when writing tests for your own extension.

---

## Extension files (`fixtures/ext/`)

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest: declares the popup, background service worker, content script (`<all_urls>`), permissions (`storage`, `tabs`, `activeTab`), and a web-accessible `iframe.html`. |
| `popup.html` / `popup.js` | Toolbar popup: a single-page UI tested via `ext.popup.open()`. |
| `background.js` | Background service worker: responds to messages (e.g. `SAVE`, `SAVE_WINDOW`), stores data in `chrome.storage.local`, and has an `onInstalled` listener used to test `ext.simulateUpdate()`. *Note: that listener deliberately ignores the real first-`install` event so it only records simulated `'update'`s — a test-specific guard, not something to copy verbatim into a real extension.* |
| `content.js` | Content script injected at `document_idle` into every page. Injects **two** UI surfaces: (1) a Shadow-DOM root (`<div data-ext-root="shadow">` with an open shadow root containing a "Save article" button) and (2) an `<iframe data-ext-frame>` pointing at `iframe.html` (the iframe-hosted UI). |
| `iframe.html` | The iframe page loaded by `content.js`; hosts a `[data-ext-root="iframe"]` element with a "Save from iframe" button. |
| `options.html` | Extension options page — opened via `ext.openPage('options.html')`. |
| `confirm.html` / `confirm.js` | Dialog-acceptance fixture: a page that fires `window.confirm()` on button click, used to test `ext.acceptDialogs()`. |
| `dnd.html` / `dnd.js` | Drag-and-drop fixture: a small list with dnd-kit-style activation sensors, used to test `ext.dragAndDrop()`. |

### Content script: Shadow DOM + iframe

`content.js` injects two independent UI surfaces so the content-UI helper is tested against both real scenarios:

```js
// Shadow-DOM surface
const host = document.createElement('div');
host.setAttribute('data-ext-root', 'shadow');
const shadow = host.attachShadow({ mode: 'open' });
const btn = document.createElement('button');
btn.textContent = 'Save article';
shadow.appendChild(btn);
document.documentElement.appendChild(host);

// iframe surface
const iframe = document.createElement('iframe');
iframe.setAttribute('data-ext-frame', 'true');
iframe.src = chrome.runtime.getURL('iframe.html');
document.documentElement.appendChild(iframe);
```

---

## Integration tests (`tests/integration/content-ui.spec.ts`)

`content-ui.spec.ts` is the flagship spec. It covers all four content-UI paths:

| Test | What it proves |
|------|----------------|
| Shadow-DOM root | `ext.contentUi(page, { root: '[data-ext-root="shadow"]', shadow: true })` — waits for injection and pierces the open shadow root |
| iframe-hosted root | `ext.contentUi(page, { root: '[data-ext-root="iframe"]', frame: 'iframe[data-ext-frame]' })` — scopes into the iframe before locating the root |
| Not-injected diagnostic | Throws `CrxboxError` with `code: 'content-ui/not-injected'` and a `sawFrames` array when the root selector never appears |
| Wrong-frame diagnostic | Throws `CrxboxError` with `code: 'content-ui/wrong-frame'` when the `frame` selector matches no iframe |

These tests run against the real `fixtures/ext/` extension in a real Chromium — no mocks — so passing them confirms the helpers work correctly on the actual browser surface.

---

## Other integration specs

| Spec | Helper exercised |
|------|-----------------|
| `popup.spec.ts` | `ext.popup.open()`, `popup.openForTab()` |
| `popup-viewport.spec.ts` | `popup.open({ viewport })`, `popupViewport` fixture option |
| `open-page.spec.ts` | `ext.openPage()` |
| `storage.spec.ts` | `ext.storage.local/sync/session` get/set/clear, auto-reset |
| `storage-matchers.spec.ts` | `toHaveStorageValue`, `toEventuallyHaveStorageValue`, `toHaveStorageKeys` |
| `background.spec.ts` | `ext.background.evaluate`, `sendMessage`, `kill()`, `waitForReady()` |
| `dialogs.spec.ts` | `ext.acceptDialogs()` |
| `drag-and-drop.spec.ts` | `ext.dragAndDrop()` |
| `windows.spec.ts` | `ext.windows.create()`, `WindowHandle` |
| `tabs.spec.ts` | `ext.tabs.create()`, `ext.tabs.query()`, `ext.tabs.close()` |
| `simulate-update.spec.ts` | `ext.simulateUpdate()` *(experimental)* |
| `loader.spec.ts` | `loader/duplicate-playwright`, `loader/build-not-found`, `loader/sw-timeout` diagnostics |
| `launch-options.spec.ts` | `headless`/`channel`/`slowMo`/`use.launchOptions` forwarding |

---

## How to adapt it for your extension

1. Copy the test setup from `tests/integration/_setup.ts` — it exports a `test` and `EXT_PATH` pointing at `fixtures/ext/`.
2. Change `EXT_PATH` to point at your built extension (`dist/` or similar).
3. Replace the `data-ext-root` and `data-ext-frame` selectors with your extension's actual element selectors.
4. For content-UI tests, the pattern is always:

```ts
import { test, expect } from 'crxbox';
test.use({ extensionPath: './dist' });

test('injected UI is accessible', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');

  // Shadow-DOM UI
  const ui = await ext.contentUi(page, { root: '[data-your-root]', shadow: true });
  await expect(ui.getByRole('button', { name: 'Your button' })).toBeVisible();
});
```

See [`docs/API.md`](API.md) for the full `contentUi` signature and all available helpers.
