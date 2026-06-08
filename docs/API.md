# crxbox API reference

Complete reference for crxbox's public API. For install and a guided getting-started, see the [README](../README.md). For an AI-agent-oriented condensed version, see the bundled `skill/SKILL.md`.

- [Setup & configuration](#setup--configuration)
- [Entry points](#entry-points)
- [The `ext` fixture](#the-ext-fixture)
  - [`ext.id` / `ext.url()`](#extid--exturl)
  - [`ext.popup`](#extpopup)
  - [`ext.openPage()`](#extopenpath-opts)
  - [`ext.acceptDialogs()`](#extacceptdialogpage)
  - [`ext.dragAndDrop()`](#extdragandropsource-target-opts)
  - [`ext.simulateUpdate()` *(experimental)*](#extsimulateupdate-experimental)
  - [`ext.windows`](#extwindows)
  - [`ext.tabs`](#exttabs)
  - [`ext.contentUi()`](#extcontentui)
  - [`ext.background`](#extbackground)
  - [`ext.storage`](#extstorage)
- [Matchers](#matchers)
- [Error handling](#error-handling)
- [Exports](#exports)
- [Patterns](#patterns)
- [Limitations & notes](#limitations--notes)

---

## Setup & configuration

crxbox is configured with Playwright fixture **options**. Set them with `test.use({...})` (per file) or in a project's `use` block in `playwright.config.ts`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `extensionPath` | `string` | **yes** | Path to the built, unpacked extension — the directory containing `manifest.json`. Resolved relative to the cwd. |
| `extensionKey` | `string` | no | **Reserved.** A future deterministic-extension-ID feature. **Not wired in v1 — setting it has no effect.** |
| `popupViewport` | `{ width: number; height: number }` | no | Default viewport for `ext.popup.open()`. See [viewport resolution](#extpopupopen-options). |

```ts
import { test } from 'crxbox';
test.use({ extensionPath: './dist' });
```

crxbox launches a **persistent Chromium context** (required for extensions) using Playwright's bundled `chromium` channel, loads your unpacked extension, resolves its ID from the service-worker URL, and **clears all `chrome.storage` areas between tests** so each test starts clean.

**Launch config forwarding.** crxbox forwards Playwright's resolved launch configuration automatically — `headless` / `--headed`, `PWDEBUG`, `channel`, `slowMo`, and `use.launchOptions` are all honored. Caller `args` (from `use.launchOptions.args`) are **appended** to crxbox's two required extension flags (`--disable-extensions-except` and `--load-extension`) rather than replacing them.

---

## Entry points

### Pre-wired `test` / `expect` (default)

```ts
import { test, expect } from 'crxbox';
test.use({ extensionPath: './dist' });
```

`test` is a Playwright `test` already extended with the crxbox fixtures (`ext`, plus the `extensionPath`/`extensionKey` options). `expect` is Playwright's `expect` with the [storage matchers](#matchers) registered (`toHaveStorageValue`, `toEventuallyHaveStorageValue`, `toHaveStorageKeys`).

### `createExtensionFixtures(config?)` — bring your own Playwright

Returns a fixtures object to merge into your own `base.extend(...)`, so crxbox composes with your existing fixtures (zero lock-in).

```ts
import { test as base } from '@playwright/test';
import { createExtensionFixtures } from 'crxbox';

export const test = base.extend(createExtensionFixtures({ path: './dist' }));
export const expect = test.expect;
```

**Signature:** `createExtensionFixtures(config?: { path?: string; key?: string; popupViewport?: { width: number; height: number } })`
The `config.path`/`config.key`/`config.popupViewport` set the default values for the `extensionPath`/`extensionKey`/`popupViewport` options (all still overridable with `test.use(...)`).

---

## The `ext` fixture

A test that destructures `{ ext }` gets the extension-aware facade. It also exposes Playwright's own `context`, `page`, etc.

```ts
test('…', async ({ ext, context, page }) => { /* … */ });
```

### `ext.id` / `ext.url()`

| Member | Type | Description |
|--------|------|-------------|
| `ext.id` | `string` | The resolved 32-char extension ID (chars `a`–`p`), read from the service-worker URL. |
| `ext.url(path)` | `(path: string) => string` | Builds `chrome-extension://<id>/<path>`. A leading `/` in `path` is tolerated. |

```ts
ext.id;                       // "abep…  (32 chars)"
ext.url('popup.html');        // "chrome-extension://<id>/popup.html"
ext.url('/options.html');     // same normalization
```

### `ext.popup`

Two clearly-separated modes — see [Limitations](#popup-modes) for why.

#### `ext.popup.open(popupPath?, opts?)` → `Promise<Page>`

Opens the popup **as a normal page** for logic/UI assertions (covers ~90% of popup tests). Returns the Playwright `Page`.

- When `popupPath` is **omitted**, crxbox resolves it from the manifest (`action.default_popup`, then MV2 `browser_action.default_popup`, falling back to `popup.html`). Pass a path to override.
- Caveat: because the popup opens in its own tab, `chrome.tabs.query({active:true})` inside it returns the popup's own tab — not the page you navigated. To test active-tab wiring, use `openForTab` (or have your popup accept a `?tabId=` param).

<a id="extpopupopen-options"></a>**`opts` (`PopupOpenOptions`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `viewport` | `{ width: number; height: number }` | — | Size the popup page to mimic a real Chrome action popup's small dimensions. |

**Viewport resolution order** (first defined wins):

1. `opts.viewport` — per-call override.
2. `popupViewport` fixture option (`test.use({ popupViewport: { width, height } })`) — project or file default.
3. Playwright's default viewport (1280×720) — if neither is set.

Real Chrome action popups have small, constrained dimensions (typically around 400×600). For layout-sensitive assertions, pass a realistic `viewport` or pin it globally with `popupViewport`. Note that `openForTab()` does **not** accept a `viewport` option — Chrome controls the real popup window bounds.

```ts
const popup = await ext.popup.open();                              // manifest default, default viewport
const popup2 = await ext.popup.open('options.html');               // explicit path
const popup3 = await ext.popup.open(undefined, { viewport: { width: 400, height: 600 } }); // mimic real popup size
await expect(popup.getByRole('button', { name: 'Save' })).toBeVisible();
```

```ts
// Pin globally — every open() in this file will use 400×600
test.use({ popupViewport: { width: 400, height: 600 } });
const popup = await ext.popup.open(); // uses 400×600
```

#### `ext.popup.openForTab(activeTab, popupPath?)` → `Promise<Page>`

Drives the **real action/toolbar popup** from the service worker (`chrome.action.openPopup()`) so it binds to the active tab, and returns the popup `Page`.

- **Best-effort.** Requires **Chrome 127+** and a **focused window** (crxbox focuses the last-focused window for you). The popup closes on blur, and in new headless Chromium the popup `page` event is known to be flaky — prefer running such specs **headed**. Throws `popup/no-active-tab` (with the real `openPopup` error in `cause`) if it can't open.
- `popupPath` defaults to the manifest popup as with `open()`.

```ts
const popup = await ext.popup.openForTab(page);
```

### `ext.openPage(path, opts?)`

Open any extension page (options page, full-page view, sandbox) as a normal `Page` — the neutral sibling of `popup.open()` for non-popup pages.

**Signature:** `openPage(path: string, opts?: { viewport?: { width: number; height: number } }): Promise<Page>`

Navigates a new tab to `chrome-extension://<id>/<path>` and returns the `Page`. Optionally resizes the viewport before navigation.

```ts
const options = await ext.openPage('options.html');
const options2 = await ext.openPage('options.html', { viewport: { width: 800, height: 600 } });
await options.getByRole('button', { name: 'Save Settings' }).click();
```

### `ext.contentUi()`

The flagship: test content-script-injected UI with injection-readiness waiting, Shadow-DOM piercing, and iframe scoping.

#### `ext.contentUi(page, options)` → `Promise<ContentUi>`

`await`ing it waits for the root to be injected (and the iframe to attach, if `frame` is set), throwing a structured diagnostic on timeout. Returns a `ContentUi` scoped to the root.

**`ContentUiOptions`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `root` | `string` | — (required) | Selector of the injected root element. |
| `shadow` | `boolean` | `false` | Documents intent only. Playwright **always** pierces open Shadow DOM, so `shadow: false` does **not** disable piercing. (Closed shadow roots are not accessible.) |
| `frame` | `string` | — | Selector of an `<iframe>` to scope into before locating `root`. |
| `timeout` | `number` | `5000` | Readiness budget (ms). When `frame` is set, the frame-wait and root-wait **share** this single budget (worst case is `timeout`, not 2×). |

**`ContentUi` methods** (all scoped under `root`, within `frame` if set):

| Method | Description |
|--------|-------------|
| `locator(selector)` | A Playwright `Locator` under the root. |
| `getByRole(...args)` | Forwards to the root locator's `getByRole`. |
| `getByText(...args)` | Forwards to the root locator's `getByText`. |
| `waitForReady()` | Re-asserts readiness (already awaited by `contentUi(...)`). |

```ts
const page = await context.newPage();
await page.goto('https://example.com');

// Shadow-DOM UI
const ui = await ext.contentUi(page, { root: '[data-ext-root]', shadow: true });
await ui.getByRole('button', { name: 'Save' }).click();

// iframe-hosted UI
const frameUi = await ext.contentUi(page, { root: '[data-root]', frame: 'iframe[data-ext-frame]' });
await expect(frameUi.getByRole('button', { name: 'Open' })).toBeVisible();
```

Failure modes: a missing `<iframe>` element → [`content-ui/wrong-frame`](#error-handling); a root that never appears → [`content-ui/not-injected`](#error-handling). Both diagnostics include `sawFrames` (the URLs of frames the page actually had) and `waitedMs`.

### `ext.acceptDialogs(page)`

Attach a handler that auto-accepts every dialog (`confirm`, `alert`, `prompt`) on a page. Returns a disposer `() => void` that detaches the handler.

**Signature:** `acceptDialogs(page: Page): () => void`

Playwright's default is to dismiss unhandled dialogs, so `window.confirm(...)` returns `false` and silently aborts destructive actions. Call `ext.acceptDialogs(page)` before clicking a button that shows a confirmation dialog.

> A `prompt` is accepted with its **default** value (whatever the page passed to `window.prompt`, or empty) — the helper does not supply prompt text. For `confirm`/`alert` this is exactly the "click OK" behavior you want. If you need to return specific prompt text, attach your own `page.on('dialog', d => d.accept('text'))` handler instead.

```ts
const detach = ext.acceptDialogs(popup);
await popup.getByRole('button', { name: 'Delete All' }).click();
// … assert the action completed …
detach(); // stop accepting dialogs
```

> **Pair with the async write-through caveat:** destructive actions often write to storage asynchronously. After clicking, use `expect.poll` (not `toHaveStorageValue`) to wait for the write to settle.

### `ext.dragAndDrop(source, target, opts?)`

Robust pointer drag from `source` to `target` that reliably trips activation-distance sensors (dnd-kit, react-dnd, and similar) where Playwright's `locator.dragTo()` issues a single move event and no-ops.

**Signature:** `dragAndDrop(source: Locator, target: Locator, opts?: DragOptions): Promise<void>`

The sequence is: press → nudge past the activation distance → stepped glide onto the target → settle past center → release.

**`DragOptions`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `steps` | `number` | `12` | Intermediate move events while gliding onto the target. |
| `nudge` | `number` | `8` | Pixels to nudge past the source center to exceed an activation distance. |
| `settle` | `number` | `4` | Pixels of final settle past the target center. |

```ts
const item = popup.locator('[data-drag-handle]').first();
const slot = popup.locator('[data-drop-slot="2"]');
await ext.dragAndDrop(item, slot);              // defaults (steps=12, nudge=8, settle=4)
await ext.dragAndDrop(item, slot, { steps: 20 }); // slower glide for stricter sensors
```

Throws `drag/no-bounding-box` when either locator is not visible or attached, and `drag/cross-page` when `source` and `target` belong to different pages.

### `ext.simulateUpdate()` *(experimental)*

Fire `chrome.runtime.onInstalled` with `reason: "update"` (or a caller-supplied reason) to exercise extension update / migration logic without a real browser-managed version bump.

> **`@experimental`** — This helper relies on Chromium's `onInstalled.dispatch` event-binding internal, which is version-sensitive and not guaranteed by the Chrome extension API surface. It is confirmed to work on recent Chromium builds but may silently break on future versions. Throws `simulate-update/unavailable` if the internal is absent.

**Signature:** `simulateUpdate(opts?: { reason?: string; previousVersion?: string }): Promise<void>`

**`opts`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `reason` | `string` | `'update'` | The `chrome.runtime.OnInstalledReason` string to fire. Typical values: `'update'`, `'install'`, `'chrome_update'`. |
| `previousVersion` | `string` | — | The version string passed as `details.previousVersion` to the `onInstalled` listener. Omit to leave it `undefined`. |

```ts
// Fire onInstalled with reason "update" and previousVersion "1.0.0"
await ext.simulateUpdate({ previousVersion: '1.0.0' });
await expect(ext.storage.local).toEventuallyHaveStorageValue('schemaVersion', '2.0.0');

// Defaults: reason = "update", previousVersion = undefined
await ext.simulateUpdate();
```

#### Simulating an extension update / migration

Use `simulateUpdate` when your `onInstalled` handler runs a data migration on `reason === 'update'`:

```ts
test('migrates legacy storage on update', async ({ ext }) => {
  // Seed the pre-update state
  await ext.storage.local.set({ schemaVersion: '1.0.0', legacyKey: 'value' });

  await ext.simulateUpdate({ previousVersion: '1.0.0' });

  await expect(ext.storage.local).toEventuallyHaveStorageValue('schemaVersion', '2.0.0');
});
```

**Robust fallback — seed-and-drive.** For migration logic with no `onInstalled` dependency, or to stay robust across Chrome versions, prefer the seed-and-drive pattern: seed the pre-update state including the version marker your code compares (`await ext.storage.local.set({ schemaVersion: '3.9.0', /* legacy data */ })`), drive the migration entry point directly (`ext.background.sendMessage({ type: 'RUN_MIGRATION' })` or `ext.background.evaluate(...)`), then assert with `toEventuallyHaveStorageValue`. This approach does not rely on any Chromium event-binding internal and remains stable across Chrome versions.

### `ext.windows`

Open real browser windows seeded with known tabs and drive multi-window flows.

#### `ext.windows.create(opts?)` → `Promise<WindowHandle>`

Opens a real browser window, optionally seeded with one or more tabs. Returns a `WindowHandle`.

**`opts`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tabs` | `string[]` | `[]` | URLs to open in the window. Each entry may be a full URL or a bare extension path (resolved via `ext.url()`). |
| `focused` | `boolean` | `true` | Whether the new window should be focused. |

**`WindowHandle`:**

| Member | Type | Description |
|--------|------|-------------|
| `id` | `number` | The `chrome.windows` window id. |
| `tabs` | `Page[]` | Playwright `Page` handles for each seeded tab, in creation order. Empty when `opts.tabs` was omitted or empty. |
| `focus()` | `() => Promise<void>` | Focus the window (calls `chrome.windows.update`). |
| `close()` | `() => Promise<void>` | Close the window (calls `chrome.windows.remove`). For mid-test cleanup; windows are also torn down automatically when the per-test Playwright context closes. |

When no `tabs` are supplied, the window opens with the browser's default tab and `handle.tabs` is empty — nothing was seeded to capture as a `Page` handle.

Throws `window/create-failed` if `chrome.windows.create` fails (cause in `diagnostic.cause`).

```ts
// Seed a window with two tabs and interact with each
const win = await ext.windows.create({ tabs: ['https://example.com', 'options.html'] });
const [examplePage, optionsPage] = win.tabs;
await examplePage.waitForLoadState();
await optionsPage.getByRole('button', { name: 'Save' }).click();

// Close mid-test
await win.close();
```

```ts
// Open an unsized window (handle.tabs is empty)
const win = await ext.windows.create();
console.log(win.id); // chrome window id
```

---

### `ext.tabs`

Create, query, and close browser tabs via the `chrome.tabs` API from the service worker.

#### `ext.tabs.create(url, opts?)` → `Promise<Page>`

Opens a new tab and returns its Playwright `Page`. `url` may be a full URL or a bare extension path (resolved via `ext.url()`).

**`opts`:**

| Field | Type | Description |
|-------|------|-------------|
| `windowId` | `number` | Open the tab in a specific window (e.g. from a `WindowHandle.id`). |
| `active` | `boolean` | Whether the tab should become active. |

```ts
const page = await ext.tabs.create('https://example.com');
await page.waitForLoadState();

const optionsPage = await ext.tabs.create('options.html', { windowId: win.id, active: true });
```

#### `ext.tabs.query(filter?)` → `Promise<TabInfo[]>`

Query open tabs via `chrome.tabs.query`. Returns an array of `TabInfo` descriptors.

**`TabInfo`:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number \| undefined` | Chrome tab id. |
| `windowId` | `number \| undefined` | Chrome window id containing the tab. |
| `url` | `string \| undefined` | The tab's URL. |
| `active` | `boolean` | Whether the tab is active in its window. |
| `index` | `number` | Zero-based position of the tab in its window. |

```ts
const tabs = await ext.tabs.query({ active: true });
const allTabs = await ext.tabs.query(); // no filter — returns all tabs
```

#### `ext.tabs.close(tab)` → `Promise<void>`

Close a tab by its Playwright `Page` (matched by URL) or by numeric Chrome tab id.

When matching by `Page`, the first open tab whose URL equals `page.url()` is closed. If multiple tabs share that URL, close by numeric id instead (from `query()`).

Throws `tabs/not-found` if no matching tab exists.

```ts
await ext.tabs.close(page);          // by Page
await ext.tabs.close(42);            // by numeric tab id
```

---

### `ext.background`

The MV3 service worker.

| Method | Signature | Description |
|--------|-----------|-------------|
| `evaluate` | `evaluate<R, A>(fn: (arg: A) => R \| Promise<R>, arg?: A): Promise<R>` | Run a function inside the service-worker context (it has `chrome.*` but no DOM). Errors are wrapped as `background/eval-failed`. Playwright stalls the call across a SW restart and resumes. |
| `sendMessage` | `sendMessage<R>(message: unknown): Promise<R>` | Send a `chrome.runtime` message to the worker and return its response. **Dispatched from a real extension page** (Chrome won't deliver a message a context sends to itself), opening a transient page if needed. |
| `waitForReady` | `waitForReady(timeoutMs = 10000): Promise<void>` | Probe until the worker responds, with each probe bounded so a sleeping worker can't hang the call. Throws `background/restart-timeout`. After a forced `kill()`, wake the worker with a real event first (see note). |
| `kill` | `kill(): Promise<void>` | **Forcibly terminate** the service worker via CDP (`ServiceWorker.stopAllWorkers`) — not natural idle suspend. The worker restarts on the next real event (a message from a page, a navigation it listens for, etc.); Playwright reuses the same `Worker` handle and emits no new `serviceworker` event. |

```ts
const pong = await ext.background.sendMessage({ type: 'PING' });   // → { type: 'PONG' }
const id   = await ext.background.evaluate(() => chrome.runtime.id);

await ext.background.kill();          // assert state survives a forced restart
// …then drive a real action (open a page, send a message) to wake it…
```

> **Resilience-test pattern:** `kill()` only *stops* the worker. To assert state survives, perform a real action afterwards (open an extension page and message it, or trigger an event your SW listens for); persisted `chrome.storage` survives, in-memory globals do not.

### `ext.storage`

Inspect and manipulate `chrome.storage`. Implemented by evaluating in the service worker.

`ext.storage.local`, `ext.storage.sync`, and `ext.storage.session` are each a `StorageArea`:

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get(key?: string): Promise<unknown>` | With a key, returns that value (or `undefined`); without, returns the whole area object. |
| `set` | `set(items: Record<string, unknown>): Promise<void>` | Merges items into the area. |
| `clear` | `clear(): Promise<void>` | Clears the area. |
| `.area` | `'local' \| 'sync' \| 'session'` | The area name (used by the matcher). |

`ext.storage.clearAll(): Promise<void>` clears all three areas — crxbox calls this automatically before each test, so storage is isolated per test.

> **`get(key)` returns the unwrapped value.** `chrome.storage` natively returns `{ key: value }` wrapper objects; crxbox unwraps for you, so `get('collections')` returns the array directly (not `{ collections: [...] }`). Without a key, the full area object is returned.

**Seeding app state before `popup.open()`:** set storage values first, then open the popup so the extension reads pre-seeded state:

```ts
await ext.storage.local.set({ theme: 'dark', items: [{ id: 1 }] });
const popup = await ext.popup.open();
await expect(popup.getByTestId('theme-toggle')).toHaveAttribute('data-value', 'dark');
```

```ts
await ext.storage.local.set({ collections: [{ name: 'a' }] });
const all = await ext.storage.local.get();              // { collections: [...] }
const one = await ext.storage.local.get('collections'); // [...]  (unwrapped, not { collections: [...] })
await ext.storage.session.clear();
```

---

## Matchers

### `expect(area).toHaveStorageValue(key, expected)` → `Promise<void>`

Asserts a `StorageArea` has `key` set to a value deep-equal to `expected`. Supports asymmetric matchers (`expect.arrayContaining`, `expect.objectContaining`, `expect.anything()`). Fails with a `storage/key-absent` diagnostic when the key is missing.

```ts
await expect(ext.storage.local).toHaveStorageValue(
  'collections',
  expect.arrayContaining([expect.objectContaining({ name: 'a' })]),
);
```

> **Async-write caveat:** the matcher does a **single read** — it does not poll/retry. If the value is written asynchronously by a fire-and-forget message (e.g. a button that calls `chrome.runtime.sendMessage` without awaiting), the read can race the write. Use Playwright's polling instead:
> ```ts
> await expect.poll(() => ext.storage.local.get('saved')).toEqual(/* … */);
> ```

### `expect(area).toEventuallyHaveStorageValue(key, expected, opts?)` → `Promise<void>`

Polls the storage area until the value at `key` deep-equals `expected`, or the timeout expires. Useful for async / fire-and-forget writes where a single-read assertion would race.

Supports asymmetric matchers. Can also poll for `expected: undefined` to assert a key was deleted.

**`opts`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timeout` | `number` | `5000` | Total polling budget in milliseconds. |
| `interval` | `number` | `100` | Milliseconds between each read. |

```ts
// After firing an async migration, poll until the schema version is updated
await expect(ext.storage.local).toEventuallyHaveStorageValue('schemaVersion', '2.0.0');

// Poll for key deletion
await expect(ext.storage.local).toEventuallyHaveStorageValue('tempKey', undefined);

// Custom timeout
await expect(ext.storage.local).toEventuallyHaveStorageValue('result', expect.anything(), { timeout: 10_000 });
```

### `expect(area).toHaveStorageKeys(keys)` → `Promise<void>`

Asserts that the storage area contains **all** of the listed keys (subset check — other keys are allowed). Passes as long as every key in `keys` is present; fails if any are missing.

```ts
await expect(ext.storage.local).toHaveStorageKeys(['collections', 'settings']);
```

---

## Error handling

Every crxbox wait that fails throws a **`CrxboxError`** with a structured, machine-readable `diagnostic`:

```ts
try {
  await ext.contentUi(page, { root: '#missing', timeout: 1000 });
} catch (e) {
  if (e instanceof CrxboxError) {
    e.diagnostic.code;       // "content-ui/not-injected"
    e.diagnostic.sawFrames;  // ["main", …]
  }
}
```

`CrxboxError.diagnostic` always has a `code` plus context fields; `CrxboxError.message` renders the head line, a single-line `crxbox: {json}` block, and a `hint:`. Read `.diagnostic.code` programmatically rather than parsing the message.

### Diagnostic codes

| Code | Thrown when | Fix |
|------|-------------|-----|
| `loader/build-not-found` | `extensionPath` is empty or has no `manifest.json` | Point `extensionPath` at a built, unpacked extension. |
| `loader/sw-timeout` | No MV3 service worker registered after load | Check `background.service_worker` in the manifest. |
| `loader/duplicate-playwright` | Two `@playwright/test` copies were resolved (crxbox vs. consumer) | Consume crxbox as a published or `npm pack`ed tarball; do not live-symlink a dev checkout that ships its own `node_modules`. Dedupe so only one `@playwright/test` exists on disk. |
| `popup/no-active-tab` | `openForTab()` couldn't open the popup | Pass the navigated page; run headed; the real `openPopup` error is in `cause`. |
| `content-ui/not-injected` | The `root` selector never appeared | Check the content script `matches`/`run_at`; pass `{ frame }` for iframe UI. |
| `content-ui/wrong-frame` | The target `<iframe>` element never appeared | Fix the `{ frame }` selector to match the hosting iframe. |
| `background/restart-timeout` | The SW didn't become ready in time | The worker may be crashing on startup; check its console. |
| `background/eval-failed` | `evaluate()` threw inside the worker | See `cause`; remember the SW has no DOM. |
| `storage/key-absent` | `toHaveStorageValue` found no value at `key` | Confirm the write happened and the area (local/sync/session) is correct. |
| `drag/no-bounding-box` | `dragAndDrop` source or target has no bounding box | Ensure the locator resolves to a single visible, attached element before dragging. |
| `drag/cross-page` | `dragAndDrop` source and target belong to different pages | `dragAndDrop` operates within a single page; both locators must come from the same `Page`. |
| `simulate-update/unavailable` | `simulateUpdate()` found `chrome.runtime.onInstalled.dispatch` absent | The Chromium event-binding internal is missing in this build — use the seed-and-drive fallback instead (seed pre-update storage, call the migration entry point directly). |
| `window/create-failed` | `ext.windows.create()` — `chrome.windows.create` returned no window id or threw | Check that the `tabs` URLs are valid and the extension has the `windows` or `tabs` permission. The underlying error is in `diagnostic.cause`. |
| `tabs/not-found` | `ext.tabs.close()` — no open tab matched the given `Page` URL or numeric tab id | The tab may have already been closed, or multiple tabs share the URL; close by numeric id (from `ext.tabs.query()`) for an unambiguous match. |

---

## Exports

```ts
import {
  // entry points
  test, expect, createExtensionFixtures,
  // facade + helper classes (mostly for typing)
  Ext, BackgroundHelper, StorageHelper, StorageArea, PopupHelper, ContentUi,
  WindowsHelper, TabsHelper,
  // interactions
  dragAndDrop,
  // errors
  CrxboxError,
} from 'crxbox';

import type {
  CrxboxOptions, CrxboxFixtures,   // fixture option/fixture shapes
  Area,                            // 'local' | 'sync' | 'session'
  ContentUiOptions,
  PopupOpenOptions,
  DragOptions,
  WindowHandle,                    // { id, tabs, focus(), close() }
  TabInfo,                         // { id?, windowId?, url?, active, index }
  Diagnostic, DiagnosticCode,
} from 'crxbox';
```

---

## Patterns

**Service-worker restart resilience**
```ts
await ext.background.evaluate(() => chrome.storage.local.set({ kept: 'yes' }));
await ext.background.kill();
const p = await context.newPage();
await p.goto(ext.url('popup.html'));
await p.evaluate(() => chrome.runtime.sendMessage({ type: 'PING' })); // wakes the SW
expect(await ext.background.evaluate(async () => (await chrome.storage.local.get('kept')).kept)).toBe('yes');
```

**Content UI in an iframe**
```ts
const ui = await ext.contentUi(page, { root: '[data-root]', frame: 'iframe[data-ext-frame]' });
await ui.getByRole('button', { name: 'Open' }).click();
```

**Asserting an async storage write**
```ts
await ui.getByRole('button', { name: 'Save' }).click(); // fire-and-forget message
await expect.poll(() => ext.storage.local.get('saved')).toEqual(
  expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining('example.com') })]),
);
```

---

## Limitations & notes

- **Chromium-only, persistent context.** Extensions only work in Playwright's bundled `chromium` channel; crxbox launches a persistent context for you. Headless works (new headless), but see the popup note below.
- <a id="popup-modes"></a>**Two popup modes are different things.** `open()` (popup-as-page) is reliable and covers most assertions but the popup's "active tab" is itself. `openForTab()` exercises the real toolbar popup but is best-effort (Chrome 127+, focused window, flaky in new headless — run headed).
- **`shadow` is intent-only.** Playwright always pierces *open* shadow DOM. Closed shadow roots are not accessible.
- **`extensionKey` is reserved** and currently a no-op (no deterministic-ID injection yet).
- **`toHaveStorageValue` does not poll** — use `expect.poll` for async writes.
- **ESM-only**, Node 18+. `@playwright/test` is a peer dependency. If your project's `package.json` is `"type": "commonjs"`, name your config and spec files `.mjs` / `.mts` (or set `"type": "module"`) so crxbox loads as real ESM and avoids an `ERR_REQUIRE_ESM`-class error. Example: `playwright.config.mjs`, `e2e/popup.spec.mjs`.
- **One `@playwright/test` instance.** crxbox and its consumer must share the same resolved copy of `@playwright/test`. Consume crxbox as a published or `npm pack`ed tarball (not a live dev-checkout symlink that ships its own `node_modules`); crxbox emits `loader/duplicate-playwright` when it detects a duplicate.
- **Testability boundaries.** Two known limits: (1) features that require "the current browser window's tabs" (e.g. "save all open tabs") can't be driven faithfully with `popup.open()` — the popup-as-page is not bound to a real browsing window; use `openForTab()` for those cases, accepting its best-effort constraints. (2) Load-time data-repair migrations gated behind extension-update flows (manifest `"update_url"` + version bump) are not reachable via storage-seeding + `popup.open()`.
- **Out of scope in v1** (roadmap): message spy, cross-context trace viewer, side-panel support, recorder, MCP server, and `ext.background.logs()`.
