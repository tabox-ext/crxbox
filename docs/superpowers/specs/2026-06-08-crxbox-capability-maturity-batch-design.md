# crxbox — capability + maturity batch: design

**Date:** 2026-06-08
**Source:** `/Users/gilgo/Projects/tabox/crxbox-assessment.md` (critical technical assessment after a 45-test Tabox integration) and its companion `crxbox-feedback.md`.
**Status:** approved — ready for implementation plan

## Goal

Raise crxbox's capability ceiling and adoption maturity by acting on the assessment's
prioritized recommendations (§9/§10). Specifically: add a real browser-window + tabs
primitive so tab-manager / active-tab flows become testable (the report's highest-leverage
item), harden `openForTab` on top of it, add polling/keys storage matchers, investigate a
migration/update simulation, and close the packaging/visibility/release gaps.

## Correction carried into this design

The assessment's "flagship (`contentUi`) unproven in-repo" claim (§6.4, §10) reflects a
**Tabox-side blind spot, not a crxbox gap**. `fixtures/ext/` already ships a content script
that injects a shadow-DOM root and an iframe, and `tests/integration/content-ui.spec.ts`
exercises `ext.contentUi()` against both for real (shadow, iframe, not-injected,
wrong-frame). Therefore P0.2 is reframed from "build coverage" to "make the existing
first-party coverage **visible**" (a docs task in workstream E).

## Scope decisions (confirmed with user)

- Tackle all workstreams: A (window/tabs), B (matchers), C (`openForTab` hardening),
  D (migration sim — investigate then decide), E (docs & release).
- Window/tabs API: two helper objects `ext.windows` + `ext.tabs`; all tab-producing calls
  return Playwright `Page` handles.
- Window lifecycle: rely on the existing per-test `context` teardown for cleanup; expose
  `handle.close()` for mid-test control (no separate auto-reset machinery).
- `toHaveStorageKeys`: **subset** semantics ("contains all listed keys").
- `ext.tabs.query`: returns **plain serializable tab descriptors**, not `Page` objects.
- Version: bump `0.0.0` → `0.1.0`; `npm publish` itself stays out of scope.

## Non-goals

- No actual `npm publish` / registry setup (no registry or git remote is configured) — we
  prepare for it (CHANGELOG, version) only.
- No OAuth / Google-Drive / network mocking (explicitly out of crxbox scope per §6.5).
- No attempt to make `openForTab` reliable in new-headless beyond a modest retry + the
  create-focused-window-first recipe; residual flakiness is documented, not hidden.
- No app-specific matchers (e.g. `toHaveCollectionCount`).

---

## Workstreams

Each code workstream ships with its tests and its `docs/API.md` entry. Workstream E
consolidates the narrative docs, CHANGELOG, and version bump.

### A. Real window + tabs primitive — `ext.windows` + `ext.tabs`

Two helper objects mirroring `ext.popup`/`ext.storage`, built on
`ext.background.evaluate` → `chrome.windows`/`chrome.tabs` (no new low-level
infrastructure; the SW context already has full `chrome.*` access).

**Types (public):**
```ts
export interface WindowHandle {
  /** chrome window id */
  id: number;
  /** a Playwright Page per seeded tab, in creation order */
  tabs: Page[];
  focus(): Promise<void>;
  close(): Promise<void>;
}

export interface TabInfo {
  id?: number;
  windowId?: number;
  url?: string;
  active: boolean;
  index: number;
}
```

**`WindowsHelper` (`ext.windows`):**
- `create(opts?: { tabs?: string[]; focused?: boolean }): Promise<WindowHandle>`
  - Opens a real window via `background.evaluate(() => chrome.windows.create({ focused }))`.
  - Seeds each URL in `opts.tabs` by delegating to `ext.tabs.create(url, { windowId })`, so
    every seeded tab is captured as a Playwright `Page`. If `opts.tabs` is omitted, the
    window opens with a single default `about:blank`/extension-page tab.
  - `focused` defaults to `true` (so the window is a candidate for `openForTab`).
  - On `chrome.windows.create` failure, throws `CrxboxError({ code: 'window/create-failed', cause })`.
  - Returns a `WindowHandle` whose `focus()`/`close()` call `chrome.windows.update(id,{focused:true})`
    / `chrome.windows.remove(id)` via `background.evaluate`.

**`TabsHelper` (`ext.tabs`):**
- `create(url: string, opts?: { windowId?: number; active?: boolean }): Promise<Page>`
  - Races `context.waitForEvent('page', { predicate: p => p.url().startsWith(url-or-its-origin) })`
    against `background.evaluate(() => chrome.tabs.create({ url, windowId, active }))`, then
    returns the captured `Page`. (Capturing per-tab avoids duplicate-URL ambiguity.)
- `query(filter?: chrome.tabs.QueryInfo): Promise<TabInfo[]>`
  - `background.evaluate(f => chrome.tabs.query(f))`, mapped to the serializable `TabInfo` shape.
- `close(tab: Page | number): Promise<void>`
  - Resolves a `Page` to its tab id (via `tabs.query` URL match) or accepts a numeric id,
    then `background.evaluate(() => chrome.tabs.remove(id))`.

**Lifecycle:** the `context` fixture is per-test and already calls `context.close()` after
each test (`src/fixtures.ts`), which destroys all seeded windows. So no cross-test leakage
and no new auto-reset hook is required; `handle.close()` exists for mid-test cleanup. This
is documented explicitly.

**Wiring:** add `windows: WindowsHelper` and `tabs: TabsHelper` to the `Ext` class
(constructed like the other helpers); export the helper classes and the `WindowHandle` /
`TabInfo` types from `src/index.ts`.

**Fixture support (to prove the headline flow):** add a `SAVE_WINDOW` message handler to
`fixtures/ext/background.js`: on `{ type: 'SAVE_WINDOW', windowId }` it runs
`chrome.tabs.query({ windowId })` and writes the resulting URLs to
`chrome.storage.local` under `savedWindow`.

**Tests (integration):**
1. `ext.windows.create({ tabs: [extUrlA, extUrlB, extUrlC] })` returns a handle with
   `tabs.length === 3` and each `Page.url()` matching the seeded URL. (Seeded URLs are
   extension pages so the suite stays offline.)
2. Headline E2E: create a window with 3 known extension-page tabs →
   `ext.background.sendMessage({ type: 'SAVE_WINDOW', windowId: handle.id })` →
   `expect(ext.storage.local).toEventuallyHaveStorageValue('savedWindow', expect.arrayContaining([...]))`.
   Proves window + tabs + SW + storage end-to-end **without** `openForTab`.
3. `ext.tabs.query({ windowId })` returns the 3 descriptors; `ext.tabs.close(page)` removes one
   and a follow-up `query` shows 2.

### C. `openForTab` hardening (builds on A)

- Add a modest internal retry to `openForTab` (e.g. up to 2 attempts of the focus +
  `chrome.action.openPopup` sequence before throwing `popup/no-active-tab`).
- Mark `openForTab` `@experimental` in its JSDoc and in the docs, stating it is most
  reliable headed or against a freshly created focused window.
- Document the recommended pattern: `const w = await ext.windows.create({ focused: true });
  const popup = await ext.popup.openForTab(w.tabs[0]);`
- **Test:** an `openForTab`-against-a-created-focused-window test that tolerates both the
  bound-popup path and the documented `popup/no-active-tab` throw (mirrors the existing
  best-effort test contract), so it documents behavior without flaking in new-headless.

### B. Storage matchers (`src/matchers.ts`)

Add to `storageMatchers` (registered the same way as the existing `toHaveStorageValue`):
- `toEventuallyHaveStorageValue(received: StorageArea, key, expected, opts?: { timeout?: number; interval?: number })`
  - Polls `received.get(key)` until `baseExpect(actual).toEqual(expected)` passes or the
    deadline (default `timeout: 5000`, `interval: 100`). Supports asymmetric matchers.
    On timeout, fails with the last-read value, reusing the `storage/key-absent`-style message
    shape where appropriate.
- `toHaveStorageKeys(received: StorageArea, keys: string[])`
  - Single read of `received.get()` (whole area); passes when **every** listed key is present
    (subset semantics). Failure message lists the missing keys.
- Update the TypeScript matcher type augmentation so both new matchers are typed for
  consumers (mirror however `toHaveStorageValue` is currently typed).

**Tests (integration):** `toEventuallyHaveStorageValue` passes for a delayed async write that
a single-read matcher would miss, and fails on timeout for an absent key;
`toHaveStorageKeys` passes for a subset and fails listing the missing key.

### D. Migration/update simulation — investigate, then decide

**Spike (timeboxed, first step):** determine whether `chrome.runtime.onInstalled` with
`reason: 'update'` can be triggered synthetically — try (a) dispatching to listeners (expected
unavailable in production event objects), (b) `chrome.runtime.reload()` semantics, (c) any CDP
affordance. Record the finding in the spec/plan.

**Expected outcome (default):** no clean generic mechanism exists, so deliver:
- A **documented recipe** in `docs/API.md` + `SKILL.md`: seed a "previous version" marker into
  storage and drive the extension's migration entry point via `ext.background.sendMessage`/
  `evaluate` when the extension exposes one; plus an explicit boundary statement that
  pure `onInstalled`-gated logic is unreachable from the consumer side.

**Conditional outcome:** if the spike finds a clean, generic mechanism, add a thin
`ext.simulateUpdate({ previousVersion })` helper with a test. This is feasibility-gated and
must not be forced.

### E. Docs & release polish

- **README restructure (P0.1):** move the packaging/consumption contract up front — one
  `@playwright/test` instance (peer dep), consume as a published/`npm pack`ed tarball (not a
  live dev-checkout symlink), with npm/yarn/pnpm one-liners. Keep the
  `loader/duplicate-playwright` reference.
- **Trace/debug recipe (P2.9):** a short section (README or `docs/API.md`) showing
  `PWDEBUG=1`, `--headed`, `slowMo`, and the Playwright trace-viewer workflow through the
  crxbox fixtures.
- **Flagship reference doc (P0.2, reframed):** document `fixtures/ext/` as the canonical
  example extension (popup + content script with shadow/iframe UI + options + SW) and point
  at `tests/integration/content-ui.spec.ts` as the in-repo proof that `contentUi` works.
- **`docs/API.md` + `src/skill/SKILL.md`:** document `ext.windows`/`ext.tabs`, the two new
  matchers, the `openForTab` create-focused-window recipe + experimental marker, and the
  migration recipe.
- **CHANGELOG.md:** create using Keep a Changelog format, summarizing the prior feedback
  batch (helpers, diagnostics, launch-config forwarding) and this batch.
- **Version bump:** `package.json` `0.0.0` → `0.1.0`.

---

## Public API surface review

Additions (no breaking changes):
- `ext.windows: WindowsHelper`, `ext.tabs: TabsHelper` — new helper objects on `Ext`.
- Exported: `WindowsHelper`, `TabsHelper`, types `WindowHandle`, `TabInfo`.
- `toEventuallyHaveStorageValue`, `toHaveStorageKeys` — new matchers (+ type augmentation).
- New diagnostic code `window/create-failed`.
- Possibly `ext.simulateUpdate(...)` (feasibility-gated; default is docs-only).
- `popup.openForTab` gains an internal retry and an `@experimental` marker (signature unchanged).

## Testing strategy

- **Integration (Playwright against `fixtures/ext/`):** windows/tabs create + query + close;
  the `SAVE_WINDOW` headline E2E; `openForTab`-against-created-window (tolerant); both new
  matchers; (if shipped) `simulateUpdate`.
- **Unit (Vitest):** any pure logic factored out (e.g. `TabInfo` mapping, matcher
  poll/compare helper) where it can be tested without a browser.
- `npm run typecheck`, `npm run build`, `npm run lint`, full `test:unit` + `test:int` must pass.
- Seeded tab URLs use extension pages (`ext.url(...)`) so the suite remains offline-safe.

## Build order

A (windows/tabs + fixture `SAVE_WINDOW` + tests) → C (`openForTab` hardening) → B (matchers)
→ D (spike → docs / conditional helper) → E (docs, flagship reference, trace recipe,
CHANGELOG, version bump). Each code workstream lands with tests + `API.md` entry; E
consolidates narrative docs; then commit.
