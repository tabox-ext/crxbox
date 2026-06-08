# crxbox — current-window closure (`0.2.0`): design

**Date:** 2026-06-08
**Source:** updated `/Users/gilgo/Projects/tabox/crxbox-assessment.md` §12 (re-evaluation of crxbox `0.1.0`).
**Status:** approved — ready for implementation plan

## Goal

Close the one remaining high-leverage gap the updated assessment identified: the headline
**"save the current window's tabs via the popup UI"** flow is still not cleanly testable in
headless. crxbox `0.1.0` shipped the window/tabs foundation and dissolved the migration
boundary (§6.5 #2), but binding the popup to a *seeded* window was thought to require the
flaky real-toolbar-popup path (`openForTab` → `chrome.action.openPopup`, which throws
`popup/no-active-tab` in new-headless).

## Spike finding (verified before this design)

Opening the popup page **as a tab inside a seeded window** makes
`chrome.tabs.query({currentWindow:true})` from that popup resolve to the seeded window's
tabs. Verified empirically in-repo (throwaway spec, since deleted):

```
currentWindow urls: [".../options.html", ".../iframe.html", ".../popup.html"]
```

So the headline flow IS testable in headless without `chrome.action.openPopup`. The
capability already exists in `0.1.0` (`ext.tabs.create(ext.url('popup.html'), { windowId })`)
but is undiscoverable — even the assessment's expert author concluded the flow "still
requires `openForTab`." The gap is **ergonomics + visibility**, not capability.

**Confirmed caveat:** the popup's own tab is included in the current-window query results, so
assertions must use `arrayContaining` / filter extension pages.

## Scope decisions (confirmed with user)

- Expose the unlock as a first-class helper `ext.popup.openInWindow(window, popupPath?, opts?)`.
- Model the in-repo closure proof via a **popup-driven** `currentWindow` query (mirrors
  Tabox's `getCurrentTabsAndGroups()`), not the existing SW-side `SAVE_WINDOW` handler.
- Ship the `tabs/create-failed` diagnostic (symmetry with `window/create-failed`).
- `openForTab`: spike a hardening attempt; ship the deterministic "focus the activeTab's own
  window" improvement regardless; document headed-only for real-popup fidelity.
- Version: `0.1.0` → `0.2.0` (additive).

## Non-goals

- No attempt to make the real toolbar popup (`chrome.action.openPopup`) reliable in
  new-headless — it is unsupported there; documented as headed-only.
- No `npm publish` (no registry/remote configured).
- No app-specific helpers.

---

## Workstreams

Each code workstream ships with tests + its `docs/API.md` entry. Workstream D consolidates
narrative docs, CHANGELOG, and the version bump.

### B. `tabs/create-failed` diagnostic (built first; A depends on hardened tabs.create)

- Add `'tabs/create-failed'` to `DiagnosticCode` + a `HINTS` entry.
- Harden `ext.tabs.create` (`src/helpers/tabs.ts`): currently a `chrome.tabs.create` failure
  surfaces as `background/eval-failed`, and a never-appearing page silently hits the 10s
  `waitForEvent` timeout (a Playwright `TimeoutError`, not a `CrxboxError`). Restructure so:
  - the `waitForEvent('page', …)` promise is guarded (`.catch(() => null)`),
  - a thrown `chrome.tabs.create` is caught and re-thrown as
    `CrxboxError({ code: 'tabs/create-failed', url, cause })` (unwrapping the inner
    `background/eval-failed` cause one level, as `windows.ts` does),
  - a null capture (timeout) throws `CrxboxError({ code: 'tabs/create-failed', url, cause: 'tab did not open within 10s' })`.
- `ext.windows.create` delegates to `tabs.create`, so it inherits the better error.
- **Unit-testable** piece: none new beyond the existing pattern; covered by integration.
- **Integration test:** `ext.tabs.create('chrome-extension://<id>/does-not-exist.html')`-style
  failure (or an invalid URL) asserts `err.diagnostic.code === 'tabs/create-failed'` within a
  bounded time (not a 10s hang). Use a URL that reliably fails fast; if none is reliable,
  assert the code via a forced-failure path and keep the timeout test bounded.

### A. `ext.popup.openInWindow(window, popupPath?, opts?)` — the unlock

- **Signature:**
  `openInWindow(window: WindowHandle | number, popupPath?: string, opts?: PopupOpenOptions): Promise<Page>`
- **Behavior:** resolve `windowId` from the `WindowHandle` or numeric id; resolve the popup
  path via the existing `resolvePopupPath` (manifest `action.default_popup` default); open the
  popup page as a tab in that window via `this.ext.tabs.create(this.ext.url(path), { windowId })`;
  apply `opts?.viewport ?? this.ext.options.popupViewport` via `page.setViewportSize` *after*
  load (documented — navigation is driven by `chrome.tabs.create`); return the `Page`.
- Lives on `PopupHelper` (`src/helpers/popup.ts`); reuses `resolvePopupPath`, `this.ext.url`,
  `this.ext.options.popupViewport`, and `this.ext.tabs`.
- **Fixture support (closure proof):** add a "Save window" button to `fixtures/ext/popup.html`
  and a handler in `fixtures/ext/popup.js` that runs
  `chrome.tabs.query({ currentWindow: true })` and writes the resulting URLs to
  `chrome.storage.local` under `savedCurrentWindow` — mirroring Tabox's
  `getCurrentTabsAndGroups()` (which resolves the popup's own window).
- **Integration test (the §6.5 #1 closure):**
  1. `const win = await ext.windows.create({ tabs: [ext.url('options.html'), ext.url('iframe.html')] });`
  2. `const popup = await ext.popup.openInWindow(win);`
  3. click the popup's "Save window" button
  4. `await expect(ext.storage.local).toEventuallyHaveStorageValue('savedCurrentWindow', expect.arrayContaining([ext.url('options.html'), ext.url('iframe.html')]));`
  This proves the popup's `currentWindow` query resolves to the seeded window — the headline
  flow, in headless, with no `openForTab`.

### C. `openForTab` hardening (spike, then ship the clean win)

- **Spike (timeboxed):** confirm whether the real toolbar popup can be made reliable in
  new-headless. Expected: `chrome.action.openPopup` is unsupported there (no fix); headed
  works (the assessment accepts headed).
- **Ship regardless — deterministic window focus:** today `openForTab` focuses
  `chrome.windows.getLastFocused()`. Change it to focus the window that *contains* `activeTab`:
  resolve `activeTab`'s `windowId` (via `chrome.tabs.query`/the tab URL, or a CDP/`page`-level
  affordance) and `chrome.windows.update(windowId, { focused: true })` before
  `chrome.action.openPopup({ windowId })`. This removes ambiguity when multiple windows exist
  and pairs cleanly with `ext.windows.create({ focused: true })`.
- Improve the `popup/no-active-tab` diagnostic hint to point at running headed or using
  `openInWindow` for current-window logic.
- Keep the `@experimental` marker; document `openForTab` as headed-only for real-popup
  fidelity, `openInWindow` as the headless path.
- **Test:** keep the existing tolerant `open-for-tab.spec.ts` contract (bound popup OR
  `popup/no-active-tab`); if the deterministic-focus change is observable, assert it doesn't
  regress (still tolerant in headless).

### D. Docs & release

- `docs/API.md`: document `ext.popup.openInWindow` as the **current-window/save-tabs recipe**
  (with the popup-tab caveat and the viewport-after-load note); add `tabs/create-failed` to the
  codes table; clarify `openForTab` headed-only + cross-reference `openInWindow`.
- `src/skill/SKILL.md`: add `openInWindow` to the popup helper bullet + a short "testing
  current-window flows" note; add `tabs/create-failed` to the failure-codes table.
- `README.md`: note `openInWindow` in the at-a-glance table (Popup/Windows area).
- `docs/fixture-extension.md`: mention the new "Save window" button in `popup.js`.
- `CHANGELOG.md`: add `[0.2.0] - 2026-06-08`; bump `package.json` `0.1.0` → `0.2.0`.

---

## Public API surface review

Additions (no breaking changes):
- `ext.popup.openInWindow(window, popupPath?, opts?)` — new method.
- `'tabs/create-failed'` — new diagnostic code.
- `openForTab` internal behavior change (focus the activeTab's own window) — signature
  unchanged.
- Version `0.2.0`.

## Testing strategy

- **Integration (Playwright against `fixtures/ext/`):** the openInWindow closure proof
  (popup-driven `currentWindow` save), `tabs/create-failed` (bounded failure), and the existing
  tolerant `openForTab` test. Seeded URLs are extension pages (offline-safe).
- `npm run typecheck`, `npm run build`, `npm run lint`, full `test:unit` + `test:int` pass.

## Build order

B (`tabs/create-failed` + hardened `tabs.create`) → A (`openInWindow` + fixture Save-window +
closure test) → C (`openForTab` spike + deterministic-focus + diagnostic/docs) → D (docs,
CHANGELOG, version bump). Each code workstream lands with tests + `API.md` entry; D
consolidates; then commit.
