# crxbox Current-Window Closure (`0.2.0`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "save the current window's tabs" flow testable in headless via `ext.popup.openInWindow(window)`, add a `tabs/create-failed` diagnostic, harden `openForTab`'s window focus, and ship docs + `0.2.0`.

**Architecture:** crxbox is a small ESM-only Playwright wrapper. `openInWindow` opens the popup as a tab inside a seeded window (via the existing `ext.tabs.create(url, { windowId })`), so the popup's `chrome.tabs.query({currentWindow:true})` resolves to that window — verified by spike. New behavior is exercised by Playwright integration tests against `fixtures/ext/`.

**Tech Stack:** TypeScript (ES2022, ESM), `@playwright/test` (peer), `@types/chrome` (dev), Vitest (unit), Playwright (integration), tsup (build).

**Spec:** `docs/superpowers/specs/2026-06-08-crxbox-current-window-closure-design.md`

**Commit convention:** Conventional Commits. End every commit message body with:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

**Note:** `crxbox-0.0.0.tgz`/`*.tgz` and `test-results*/` are gitignored — never stage them. `src/skill/SKILL.md` is tracked despite `skill/` being gitignored; use `git add -f src/skill/SKILL.md` if git balks.

---

## File Structure

**Modify:**
- `src/diagnostics.ts` — add `tabs/create-failed`; reword `popup/no-active-tab` hint.
- `src/helpers/tabs.ts` — harden `create()` to throw structured `tabs/create-failed`.
- `src/helpers/popup.ts` — add `openInWindow()`; deterministic window focus in `openForTab()`.
- `fixtures/ext/popup.html` / `fixtures/ext/popup.js` — add a "Save window" button + handler.
- `docs/API.md`, `src/skill/SKILL.md`, `README.md`, `docs/fixture-extension.md` — docs sweep.
- `package.json` — `0.1.0` → `0.2.0`. `CHANGELOG.md` — add `[0.2.0]`.

**Create:**
- `tests/integration/open-in-window.spec.ts` — the §6.5 #1 closure proof.
- `tests/integration/tabs-create-failed.spec.ts` — (or extend `tabs.spec.ts`) the diagnostic test.

---

## Task 1: `tabs/create-failed` diagnostic + hardened `tabs.create`

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/helpers/tabs.ts`
- Create: `tests/integration/tabs-create-failed.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/tabs-create-failed.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';
import { CrxboxError } from '../../src/index.js';

test.use({ extensionPath: EXT_PATH });

test('tabs.create throws tabs/create-failed (bounded) when the target window is invalid', async ({ ext }) => {
  // windowId 999999 does not exist → chrome.tabs.create rejects fast in the SW.
  const err = await ext.tabs.create(ext.url('options.html'), { windowId: 999_999 }).catch((e) => e);
  expect(err).toBeInstanceOf(CrxboxError);
  expect(err.diagnostic.code).toBe('tabs/create-failed');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/integration/tabs-create-failed.spec.ts`
Expected: FAIL — today this surfaces as `background/eval-failed` (or a different code), not `tabs/create-failed`.
(If browsers missing: `npx playwright install chromium` then retry.)

- [ ] **Step 3: Add the diagnostic code + reword the popup hint**

In `src/diagnostics.ts`, add to the `DiagnosticCode` union (after `'tabs/not-found'`):

```ts
  | 'tabs/create-failed'
```

Add to the `HINTS` record:

```ts
  'tabs/create-failed':
    'chrome.tabs.create failed, or the tab never opened — check the URL is loadable (extension pages work offline) and that any windowId refers to a real window.',
```

Reword the existing `'popup/no-active-tab'` HINT to point at the headless alternative:

```ts
  'popup/no-active-tab':
    'openForTab drives the real toolbar popup (chrome.action.openPopup), which needs a focused window and is unreliable in new-headless — run headed, or use ext.popup.openInWindow(window) to test current-window logic in headless.',
```

- [ ] **Step 4: Harden `tabs.create`**

In `src/helpers/tabs.ts`, replace the `create` method with:

```ts
  /**
   * Open a new tab and return its Playwright `Page`. `url` may be a full URL or a
   * bare extension path (resolved via `ext.url`). The new target is captured via a
   * `page` event so you get a real Page handle back. Throws `tabs/create-failed`
   * if `chrome.tabs.create` rejects or the tab never opens.
   */
  async create(url: string, opts?: { windowId?: number; active?: boolean }): Promise<Page> {
    const target = toUrl(this.ext, url);
    const opened = this.ext.context
      .waitForEvent('page', {
        predicate: (p) => {
          const u = p.url();
          return (
            u === target ||
            u === target + '/' ||
            u.startsWith(target + '?') ||
            u.startsWith(target + '#')
          );
        },
        timeout: 10_000,
      })
      .catch(() => null);
    try {
      await this.ext.background.evaluate(
        async ({ url, windowId, active }) => {
          await chrome.tabs.create({ url, windowId, active });
        },
        { url: target, windowId: opts?.windowId, active: opts?.active },
      );
    } catch (e) {
      const inner = e instanceof CrxboxError ? (e.diagnostic.cause as string | undefined) : undefined;
      throw new CrxboxError({
        code: 'tabs/create-failed',
        url: target,
        cause: inner ?? (e instanceof Error ? e.message : String(e)),
      });
    }
    const page = await opened;
    if (!page) {
      throw new CrxboxError({ code: 'tabs/create-failed', url: target, cause: 'tab did not open within 10s' });
    }
    return page;
  }
```

(`CrxboxError` and `toUrl` are already imported in this file.)

- [ ] **Step 5: Run it to verify it passes**

Run: `npx playwright test tests/integration/tabs-create-failed.spec.ts`
Expected: PASS, and it returns quickly (not after a 10s hang).

- [ ] **Step 6: Regression — existing tabs tests still pass**

Run: `npx playwright test tests/integration/tabs.spec.ts tests/integration/windows.spec.ts`
Expected: all pass (the happy path and `windows.create` delegation are unaffected).

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/diagnostics.ts src/helpers/tabs.ts tests/integration/tabs-create-failed.spec.ts
git commit -m "feat(tabs): structured tabs/create-failed instead of silent timeout/eval-failed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `ext.popup.openInWindow()` + closure proof

**Files:**
- Modify: `src/helpers/popup.ts`
- Modify: `fixtures/ext/popup.html`, `fixtures/ext/popup.js`
- Create: `tests/integration/open-in-window.spec.ts`

- [ ] **Step 1: Add the "Save window" button to the fixture popup**

In `fixtures/ext/popup.html`, add a second button after the existing `#save` button:

```html
    <button id="save">Save tab</button>
    <button id="save-window">Save window</button>
    <div id="active-tab">loading…</div>
```

In `fixtures/ext/popup.js`, append a handler that saves the current window's tab URLs:

```js
document.getElementById('save-window').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  await chrome.storage.local.set({ savedCurrentWindow: tabs.map((t) => t.url) });
});
```

- [ ] **Step 2: Write the failing closure test**

Create `tests/integration/open-in-window.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

// Closes assessment §6.5 #1: the "save the current window's tabs" flow, in headless,
// WITHOUT the real toolbar popup. openInWindow puts the popup in the seeded window, so
// the popup's chrome.tabs.query({currentWindow:true}) resolves to that window.
test('openInWindow binds the popup to a seeded window so currentWindow resolves to it', async ({ ext }) => {
  const seeded = [ext.url('options.html'), ext.url('iframe.html')];
  const win = await ext.windows.create({ tabs: seeded });

  const popup = await ext.popup.openInWindow(win);
  await popup.getByRole('button', { name: 'Save window' }).click();

  // The popup's own tab is also in the window, hence arrayContaining (not toEqual).
  await expect(ext.storage.local).toEventuallyHaveStorageValue(
    'savedCurrentWindow',
    expect.arrayContaining(seeded),
  );
});

test('openInWindow accepts a numeric window id', async ({ ext }) => {
  const win = await ext.windows.create({ tabs: [ext.url('options.html')] });
  const popup = await ext.popup.openInWindow(win.id);
  expect(popup.url()).toBe(ext.url('popup.html'));
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright test tests/integration/open-in-window.spec.ts`
Expected: FAIL — `ext.popup.openInWindow` is not a function.

- [ ] **Step 4: Implement `openInWindow`**

In `src/helpers/popup.ts`:
- Add a type-only import at the top (after the existing imports):
```ts
import type { WindowHandle } from './windows.js';
```
- Add this method to `PopupHelper` (after `open`, before `openForTab`):
```ts
  /**
   * Open the popup **as a tab inside `window`** (a `WindowHandle` or a window id).
   * Because the popup then lives in that window, its
   * `chrome.tabs.query({ currentWindow: true })` resolves to that window's tabs — the
   * headless-friendly way to test "save the current window's tabs" / active-window flows
   * (no `chrome.action.openPopup`). Defaults to the manifest's `action.default_popup`.
   *
   * Note: the popup's own tab is part of the window, so it appears in current-window
   * query results — assert with `expect.arrayContaining(...)` or filter extension pages.
   * A `viewport` (per-call or fixture `popupViewport`) is applied after the page loads.
   */
  async openInWindow(
    window: WindowHandle | number,
    popupPath?: string,
    opts?: PopupOpenOptions,
  ): Promise<Page> {
    const windowId = typeof window === 'number' ? window : window.id;
    const page = await this.ext.tabs.create(this.ext.url(this.resolvePopupPath(popupPath)), {
      windowId,
    });
    const viewport = opts?.viewport ?? this.ext.options.popupViewport;
    if (viewport) await page.setViewportSize(viewport);
    return page;
  }
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx playwright test tests/integration/open-in-window.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Stability + regression**

Run: `npx playwright test tests/integration/open-in-window.spec.ts --repeat-each=5` → 10/10 pass.
Run: `npx playwright test tests/integration/popup.spec.ts` → still passes (the extra button doesn't break the existing "Save tab" assertions).

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/helpers/popup.ts fixtures/ext/popup.html fixtures/ext/popup.js tests/integration/open-in-window.spec.ts
git commit -m "feat(popup): add openInWindow() — test current-window flows in headless (§A)

Opens the popup as a tab in a seeded window so its currentWindow query resolves
to that window. Closes the assessment's save-current-window's-tabs gap.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `openForTab` deterministic window focus (+ spike)

**Files:**
- Modify: `src/helpers/popup.ts`
- (Verify) `tests/integration/open-for-tab.spec.ts`

- [ ] **Step 1: (Spike, no commit) confirm the headless limitation**

Briefly confirm with a throwaway check (delete after) that `chrome.action.openPopup` still
takes the `popup/no-active-tab` throw path in this new-headless environment even after the
focus change below — i.e., real-toolbar-popup fidelity remains headed-only. Record the result
in the commit message. Do not commit any scratch spec; remove `test-results*` if created.

- [ ] **Step 2: Ship deterministic window focus in `openForTab`**

In `src/helpers/popup.ts`, replace the `attempt` arrow inside `openForTab` so it focuses the
window that CONTAINS `activeTab` (resolved by URL), falling back to last-focused:

```ts
    const targetUrl = activeTab.url();
    const attempt = async (): Promise<string | null> =>
      this.ext.background.evaluate(async (url) => {
        try {
          const all = await chrome.tabs.query({});
          const match = all.find((t) => t.url === url);
          const winId = match?.windowId ?? (await chrome.windows.getLastFocused()).id;
          if (winId !== undefined) await chrome.windows.update(winId, { focused: true });
          await chrome.action.openPopup(winId !== undefined ? { windowId: winId } : undefined);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      }, targetUrl);
```

Leave the rest of `openForTab` (the `opened` waitForEvent, the one retry, the throw paths)
unchanged. Update the method JSDoc to state plainly: *real toolbar popup; headed-only for
reliability — use `openInWindow` to test current-window logic in headless.*

- [ ] **Step 3: Run the existing tolerant test (+ stability)**

Run: `npx playwright test tests/integration/open-for-tab.spec.ts --repeat-each=3`
Expected: all pass — the test tolerates both the bound-popup and `popup/no-active-tab` branches, so the focus change must not make it fail.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/popup.ts
git commit -m "feat(popup): openForTab focuses the activeTab's own window (deterministic) (§C)

Spike confirmed chrome.action.openPopup remains unreliable in new-headless;
openInWindow is the headless path. This focuses the correct window (the one
containing activeTab) instead of last-focused, removing multi-window ambiguity.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Docs & release (`0.2.0`)

**Files:**
- Modify: `docs/API.md`, `src/skill/SKILL.md`, `README.md`, `docs/fixture-extension.md`, `package.json`
- Modify: `CHANGELOG.md`

Read each file first to match its style. Then:

- [ ] **Step 1: `docs/API.md`**

- Add an `ext.popup.openInWindow(window, popupPath?, opts?)` subsection under `ext.popup`: it
  opens the popup as a tab in the given window (WindowHandle or id) so the popup's
  `chrome.tabs.query({currentWindow:true})` resolves to that window — **the recipe for testing
  "save current window's tabs" / active-window flows in headless**. Include the popup-tab
  caveat (use `arrayContaining`) and the viewport-after-load note. Add a short code example
  (windows.create → openInWindow → assert).
- Clarify `openForTab` is the **real toolbar popup**, **headed-only** for reliability, and
  cross-reference `openInWindow` for headless current-window logic.
- Add `tabs/create-failed` to the diagnostic codes table.
- Update the TOC if present.

- [ ] **Step 2: `src/skill/SKILL.md`**

- Extend the popup bullet with `openInWindow` and a one-line "testing current-window flows in
  headless" note (vs `openForTab` headed-only).
- Add `tabs/create-failed` to the failure-codes table.

- [ ] **Step 3: `README.md`**

- In the at-a-glance table, mention `ext.popup.openInWindow(window, path?)` in the Popup row
  (or add a brief note in the Windows row) as the headless current-window path.

- [ ] **Step 4: `docs/fixture-extension.md`**

- Update the `popup.html`/`popup.js` description to mention the new **"Save window"** button
  (queries `currentWindow` and writes `savedCurrentWindow`) used by the `openInWindow` test.

- [ ] **Step 5: `CHANGELOG.md` + version**

Add at the top (above `[0.1.0]`):

```markdown
## [0.2.0] - 2026-06-08

### Added
- `ext.popup.openInWindow(window, popupPath?, opts?)` — open the popup as a tab inside a seeded
  window so its `chrome.tabs.query({currentWindow:true})` resolves to that window; the
  headless-friendly way to test "save the current window's tabs" / active-window flows.
- Diagnostic `tabs/create-failed` — `ext.tabs.create` now raises a structured error instead of a
  silent timeout / generic eval failure.

### Changed
- `ext.popup.openForTab` focuses the window containing `activeTab` (deterministic) and is
  documented as headed-only for real-toolbar-popup fidelity; use `openInWindow` in headless.
```

In `package.json`, change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 6: Build + checks + commit**

Run: `npm run build && npm run typecheck && npm run lint` → all clean.

```bash
git add docs/API.md src/skill/SKILL.md README.md docs/fixture-extension.md CHANGELOG.md package.json
git commit -m "docs(release): document openInWindow + tabs/create-failed; openForTab headed-only; v0.2.0 (§D)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full verification + build

**Files:** none (verification only)

- [ ] **Step 1: Unit** — `npm run test:unit` → all pass.
- [ ] **Step 2: Integration** — `npm run test:int` → all pass (incl. open-in-window, tabs-create-failed, open-for-tab).
- [ ] **Step 3: Typecheck/lint/build** — `npm run typecheck && npm run lint && npm run build` → clean.
- [ ] **Step 4: Built-API sanity** —
```bash
node --input-type=module -e "import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(', ')))"
```
Expected: same value exports as before (`TabsHelper`, `WindowsHelper`, etc.) — `openInWindow` is a method on `PopupHelper`, not a new top-level export, so the export list is unchanged.

> If green, use `superpowers:finishing-a-development-branch`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- A (openInWindow + closure proof) → Task 2 (+ fixture). ✓
- B (tabs/create-failed) → Task 1. ✓
- C (openForTab spike + deterministic focus + hint) → Task 3 (hint reworded in Task 1's diagnostics edit). ✓
- D (docs, CHANGELOG, version) → Task 4. ✓

**Ordering:** Task 1 hardens `tabs.create` and adds the code that Task 2's `openInWindow` relies on (via `tabs.create`); Task 1 also reletters the `popup/no-active-tab` hint that Task 3 references. Task 2's closure test uses `toEventuallyHaveStorageValue` (already shipped in 0.1.0) and `ext.windows.create` (shipped). ✓

**Type consistency:** `openInWindow(window: WindowHandle | number, popupPath?, opts?: PopupOpenOptions)` uses existing `WindowHandle`/`PopupOpenOptions` types; `tabs/create-failed` consistent across diagnostics, tabs.ts, and tests. ✓

**Placeholder scan:** every code step has complete code; the spike step (Task 3.1) is explicitly throwaway-and-record, not a deliverable. ✓
