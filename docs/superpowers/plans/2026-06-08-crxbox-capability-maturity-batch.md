# crxbox Capability + Maturity Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real window/tabs primitive (`ext.windows`/`ext.tabs`), polling/keys storage matchers, harden `openForTab`, investigate a migration-simulation hook, and close packaging/visibility/release gaps — per the Tabox technical assessment.

**Architecture:** crxbox is a small ESM-only Playwright wrapper for Chrome-extension testing. New helpers are thin classes over `ext.background.evaluate` → `chrome.windows`/`chrome.tabs`, mirroring the existing `ext.popup`/`ext.storage` helper pattern, and are exercised by Playwright integration tests against the in-repo `fixtures/ext/`. Matchers extend the existing `storageMatchers`. Pure mapping/poll logic is unit-testable.

**Tech Stack:** TypeScript (ES2022, ESM), `@playwright/test` (peer), `@types/chrome` (dev), Vitest (unit), Playwright (integration), tsup (build).

**Spec:** `docs/superpowers/specs/2026-06-08-crxbox-capability-maturity-batch-design.md`

**Commit convention:** Conventional Commits. End every commit message body with:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## File Structure

**Create:**
- `src/helpers/tabs.ts` — `TabsHelper`, `TabInfo`, `toUrl()` helper.
- `src/helpers/windows.ts` — `WindowsHelper`, `WindowHandle`.
- `tests/integration/tabs.spec.ts` — tabs create/query/close.
- `tests/integration/windows.spec.ts` — window create/focus/close + Page handles.
- `tests/integration/save-window.spec.ts` — headline "save current window's tabs" E2E.
- `tests/integration/storage-matchers.spec.ts` — new matchers.
- `tests/integration/open-for-tab.spec.ts` — tolerant `openForTab` test.
- `docs/fixture-extension.md` — flagship reference doc.
- `CHANGELOG.md`.

**Modify:**
- `src/diagnostics.ts` — add `window/create-failed`, `tabs/not-found`.
- `src/ext.ts` — construct + expose `windows`, `tabs`.
- `src/index.ts` — export new helpers + types.
- `src/matchers.ts` — add `toEventuallyHaveStorageValue`, `toHaveStorageKeys` + type augmentation.
- `src/helpers/popup.ts` — `openForTab` retry + `@experimental`.
- `fixtures/ext/background.js` — `SAVE_WINDOW` handler.
- `README.md`, `docs/API.md`, `src/skill/SKILL.md` — docs sweep.
- `package.json` — version `0.0.0` → `0.1.0`.

---

## Task 1: New diagnostic codes

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `tests/unit/diagnostics.test.ts`

- [ ] **Step 1: Write the failing unit test**

Append to `tests/unit/diagnostics.test.ts` (`CrxboxError` is already imported there):

```ts
describe('window/tabs diagnostics', () => {
  it('renders hints for window/create-failed and tabs/not-found', () => {
    for (const code of ['window/create-failed', 'tabs/not-found'] as const) {
      const err = new CrxboxError({ code });
      expect(err.diagnostic.code).toBe(code);
      expect(err.message).toContain('hint:');
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/diagnostics.test.ts`
Expected: FAIL — `'window/create-failed'`/`'tabs/not-found'` are not valid `DiagnosticCode`s (TS error).

- [ ] **Step 3: Add the codes + hints**

In `src/diagnostics.ts`, add to the `DiagnosticCode` union (after `'drag/cross-page'`):

```ts
  | 'window/create-failed'
  | 'tabs/not-found'
```

Add to the `HINTS` record:

```ts
  'window/create-failed':
    'chrome.windows.create failed in the service worker — check the seeded tab URLs are loadable (extension pages work offline) and that the "tabs" permission is present.',
  'tabs/not-found':
    'no tab matched — the Page may have already closed, or its URL did not match any open tab in the queried window.',
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/diagnostics.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/diagnostics.ts tests/unit/diagnostics.test.ts
git commit -m "feat(diagnostics): add window/create-failed and tabs/not-found codes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Storage matchers — `toEventuallyHaveStorageValue` + `toHaveStorageKeys`

**Files:**
- Modify: `src/matchers.ts`
- Create: `tests/integration/storage-matchers.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/storage-matchers.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('toEventuallyHaveStorageValue polls until a delayed write lands', async ({ ext }) => {
  // Schedule a write ~300ms in the future from the SW; a single-read matcher would miss it.
  await ext.background.evaluate(() => {
    setTimeout(() => void chrome.storage.local.set({ late: 'arrived' }), 300);
  });
  await expect(ext.storage.local).toEventuallyHaveStorageValue('late', 'arrived');
});

test('toEventuallyHaveStorageValue fails (bounded) for an absent key', async ({ ext }) => {
  const err = await expect(ext.storage.local)
    .toEventuallyHaveStorageValue('never', 'x', { timeout: 500 })
    .catch((e) => e);
  expect(err).toBeTruthy();
});

test('toHaveStorageKeys passes for a subset and reports missing keys', async ({ ext }) => {
  await ext.storage.local.set({ a: 1, b: 2, c: 3 });
  await expect(ext.storage.local).toHaveStorageKeys(['a', 'b']);
  const err = await expect(ext.storage.local).toHaveStorageKeys(['a', 'zzz']).catch((e) => e);
  expect(String(err)).toContain('zzz');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/integration/storage-matchers.spec.ts`
Expected: FAIL — `toEventuallyHaveStorageValue`/`toHaveStorageKeys` are not functions / not typed.

- [ ] **Step 3: Implement the matchers**

In `src/matchers.ts`, add two methods to the `storageMatchers` object (after `toHaveStorageValue`):

```ts
  async toEventuallyHaveStorageValue(
    received: StorageArea,
    key: string,
    expected: unknown,
    opts?: { timeout?: number; interval?: number },
  ) {
    const timeout = opts?.timeout ?? 5_000;
    const interval = opts?.interval ?? 100;
    const deadline = Date.now() + timeout;
    let actual: unknown;
    let pass = false;
    for (;;) {
      actual = await received.get(key);
      if (actual !== undefined) {
        try {
          baseExpect(actual).toEqual(expected);
          pass = true;
        } catch {
          pass = false;
        }
      }
      if (pass || Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, interval));
    }
    const fmt = (v: unknown): string =>
      v && typeof (v as { asymmetricMatch?: unknown }).asymmetricMatch === 'function'
        ? String(v)
        : JSON.stringify(v);
    return {
      pass,
      message: () =>
        `expected storage.${received.area}["${key}"] ${pass ? 'not ' : ''}to eventually equal expected (within ${timeout}ms)\n` +
        `  expected: ${fmt(expected)}\n` +
        `  received: ${fmt(actual)}`,
    };
  },

  async toHaveStorageKeys(received: StorageArea, keys: string[]) {
    const all = (await received.get()) as Record<string, unknown> | undefined;
    const present = all ? Object.keys(all) : [];
    const missing = keys.filter((k) => !present.includes(k));
    const pass = missing.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `expected storage.${received.area} not to contain keys ${JSON.stringify(keys)}`
          : `expected storage.${received.area} to contain keys ${JSON.stringify(keys)}\n` +
            `  missing: ${JSON.stringify(missing)}\n` +
            `  present: ${JSON.stringify(present)}`,
    };
  },
```

Then extend the type augmentation block — add both signatures to the `Matchers` interface:

```ts
    interface Matchers<R, T = unknown> {
      toHaveStorageValue(key: string, expected: unknown): Promise<R>;
      toEventuallyHaveStorageValue(
        key: string,
        expected: unknown,
        opts?: { timeout?: number; interval?: number },
      ): Promise<R>;
      toHaveStorageKeys(keys: string[]): Promise<R>;
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test tests/integration/storage-matchers.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/matchers.ts tests/integration/storage-matchers.spec.ts
git commit -m "feat(matchers): add toEventuallyHaveStorageValue and toHaveStorageKeys (§8/P2.8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `TabsHelper` (`ext.tabs`)

**Files:**
- Create: `src/helpers/tabs.ts`
- Modify: `src/ext.ts`
- Modify: `src/index.ts`
- Create: `tests/integration/tabs.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/tabs.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('tabs.create opens an extension page and returns a Page', async ({ ext }) => {
  const page = await ext.tabs.create(ext.url('options.html'));
  await expect(page.locator('#title')).toHaveText('Options Page');
});

test('tabs.create accepts a bare extension path', async ({ ext }) => {
  const page = await ext.tabs.create('options.html');
  expect(page.url()).toBe(ext.url('options.html'));
});

test('tabs.query returns descriptors and tabs.close removes a tab', async ({ ext }) => {
  const page = await ext.tabs.create('options.html');
  const before = await ext.tabs.query({ url: ext.url('options.html') });
  expect(before.length).toBeGreaterThanOrEqual(1);
  expect(before[0]!.url).toBe(ext.url('options.html'));

  await ext.tabs.close(page);
  const after = await ext.tabs.query({ url: ext.url('options.html') });
  expect(after.length).toBe(before.length - 1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/integration/tabs.spec.ts`
Expected: FAIL — `ext.tabs` is undefined.

- [ ] **Step 3: Create `src/helpers/tabs.ts`**

```ts
import type { Page } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';

/** Serializable tab descriptor returned by `ext.tabs.query`. */
export interface TabInfo {
  id?: number;
  windowId?: number;
  url?: string;
  active: boolean;
  index: number;
}

/** Resolve a bare extension path to a full URL; pass through real URLs and about:blank. */
export function toUrl(ext: Ext, u: string): string {
  if (u === 'about:blank' || /^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u;
  return ext.url(u);
}

export class TabsHelper {
  constructor(private readonly ext: Ext) {}

  /**
   * Open a new tab and return its Playwright `Page`. `url` may be a full URL or a
   * bare extension path (resolved via `ext.url`). The new target is captured via a
   * `page` event so you get a real Page handle back.
   */
  async create(url: string, opts?: { windowId?: number; active?: boolean }): Promise<Page> {
    const target = toUrl(this.ext, url);
    const opened = this.ext.context.waitForEvent('page', {
      predicate: (p) => p.url() === target || p.url().startsWith(target),
      timeout: 10_000,
    });
    await this.ext.background.evaluate(
      async ({ url, windowId, active }) => {
        await chrome.tabs.create({ url, windowId, active });
      },
      { url: target, windowId: opts?.windowId, active: opts?.active },
    );
    return opened;
  }

  /** Query open tabs (SW `chrome.tabs.query`), returning serializable descriptors. */
  async query(filter?: chrome.tabs.QueryInfo): Promise<TabInfo[]> {
    const tabs = await this.ext.background.evaluate(async (f) => {
      const result = await chrome.tabs.query(f ?? {});
      return result.map((t) => ({
        id: t.id,
        windowId: t.windowId,
        url: t.url,
        active: t.active,
        index: t.index,
      }));
    }, filter);
    return tabs as TabInfo[];
  }

  /** Close a tab by its Playwright `Page` (matched by URL) or by numeric tab id. */
  async close(tab: Page | number): Promise<void> {
    let tabId: number | undefined;
    if (typeof tab === 'number') {
      tabId = tab;
    } else {
      const url = tab.url();
      const all = await this.query({});
      tabId = all.find((t) => t.url === url)?.id;
      if (tabId === undefined) throw new CrxboxError({ code: 'tabs/not-found', url });
    }
    await this.ext.background.evaluate((id) => chrome.tabs.remove(id), tabId);
  }
}
```

- [ ] **Step 4: Wire into `Ext` and export**

In `src/ext.ts`:
- Add import: `import { TabsHelper } from './helpers/tabs.js';`
- Add a readonly field and construct it. Add after the `popup` field:
```ts
  readonly tabs: TabsHelper;
```
and in the constructor after `this.popup = new PopupHelper(this);`:
```ts
    this.tabs = new TabsHelper(this);
```

In `src/index.ts`, add:
```ts
export { TabsHelper } from './helpers/tabs.js';
export type { TabInfo } from './helpers/tabs.js';
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx playwright test tests/integration/tabs.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/helpers/tabs.ts src/ext.ts src/index.ts tests/integration/tabs.spec.ts
git commit -m "feat(ext): add ext.tabs (create/query/close) helper (§A/P1.4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `WindowsHelper` (`ext.windows`)

**Files:**
- Create: `src/helpers/windows.ts`
- Modify: `src/ext.ts`
- Modify: `src/index.ts`
- Create: `tests/integration/windows.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/windows.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('windows.create seeds a window with known tabs as Page handles', async ({ ext }) => {
  const handle = await ext.windows.create({
    tabs: [ext.url('options.html'), ext.url('popup.html')],
  });
  expect(typeof handle.id).toBe('number');
  expect(handle.tabs).toHaveLength(2);
  expect(handle.tabs[0]!.url()).toBe(ext.url('options.html'));
  expect(handle.tabs[1]!.url()).toBe(ext.url('popup.html'));

  // the seeded tabs really belong to the created window
  const inWindow = await ext.tabs.query({ windowId: handle.id });
  const urls = inWindow.map((t) => t.url).sort();
  expect(urls).toContain(ext.url('options.html'));
  expect(urls).toContain(ext.url('popup.html'));
});

test('handle.close() removes the window', async ({ ext }) => {
  const handle = await ext.windows.create({ tabs: [ext.url('options.html')] });
  await handle.close();
  const remaining = await ext.tabs.query({ windowId: handle.id });
  expect(remaining.length).toBe(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/integration/windows.spec.ts`
Expected: FAIL — `ext.windows` is undefined.

- [ ] **Step 3: Create `src/helpers/windows.ts`**

```ts
import type { Page } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';
import { toUrl } from './tabs.js';

/** A handle to a real browser window seeded with known tabs. */
export interface WindowHandle {
  /** chrome window id */
  id: number;
  /** a Playwright Page per seeded tab, in creation order */
  tabs: Page[];
  focus(): Promise<void>;
  close(): Promise<void>;
}

export class WindowsHelper {
  constructor(private readonly ext: Ext) {}

  /**
   * Open a real browser window seeded with `tabs` (full URLs or bare extension
   * paths). Returns a handle whose `tabs` are real Playwright Pages. Created
   * windows are torn down automatically when the per-test context closes;
   * `handle.close()` is available for mid-test cleanup.
   */
  async create(opts?: { tabs?: string[]; focused?: boolean }): Promise<WindowHandle> {
    const rawUrls = opts?.tabs?.length ? opts.tabs : ['about:blank'];
    const urls = rawUrls.map((u) => toUrl(this.ext, u));
    const focused = opts?.focused ?? true;

    const firstOpened = this.ext.context.waitForEvent('page', {
      predicate: (p) => p.url() === urls[0] || p.url().startsWith(urls[0]!),
      timeout: 10_000,
    });

    let id: number;
    try {
      const created = await this.ext.background.evaluate(
        async ({ url, focused }) => {
          const w = await chrome.windows.create({ url, focused });
          return { id: w?.id };
        },
        { url: urls[0], focused },
      );
      if (created.id === undefined) throw new Error('chrome.windows.create returned no window id');
      id = created.id;
    } catch (e) {
      firstOpened.catch(() => {}); // suppress orphaned timeout
      throw new CrxboxError({
        code: 'window/create-failed',
        cause: e instanceof Error ? e.message : String(e),
      });
    }

    const tabs: Page[] = [await firstOpened];
    for (const u of urls.slice(1)) {
      tabs.push(await this.ext.tabs.create(u, { windowId: id }));
    }

    return {
      id,
      tabs,
      focus: async () => {
        await this.ext.background.evaluate(
          (id) => chrome.windows.update(id, { focused: true }).then(() => {}),
          id,
        );
      },
      close: async () => {
        await this.ext.background.evaluate((id) => chrome.windows.remove(id), id);
      },
    };
  }
}
```

- [ ] **Step 4: Wire into `Ext` and export**

In `src/ext.ts`:
- Add import: `import { WindowsHelper } from './helpers/windows.js';`
- Add field after `tabs`:
```ts
  readonly windows: WindowsHelper;
```
- In the constructor after `this.tabs = new TabsHelper(this);`:
```ts
    this.windows = new WindowsHelper(this);
```

In `src/index.ts`, add:
```ts
export { WindowsHelper } from './helpers/windows.js';
export type { WindowHandle } from './helpers/windows.js';
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx playwright test tests/integration/windows.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Stability check**

Run: `npx playwright test tests/integration/windows.spec.ts --repeat-each=5`
Expected: 5/5 pass. If the first-tab page-capture is flaky, raise the `waitForEvent` timeout or relax the predicate — do not weaken the handle assertions.

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/helpers/windows.ts src/ext.ts src/index.ts tests/integration/windows.spec.ts
git commit -m "feat(ext): add ext.windows.create() real-window/tabs primitive (§A/P1.4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Headline E2E — "save current window's tabs"

**Files:**
- Modify: `fixtures/ext/background.js`
- Create: `tests/integration/save-window.spec.ts`

- [ ] **Step 1: Add the `SAVE_WINDOW` handler to the fixture**

In `fixtures/ext/background.js`, add a new `if` block inside the existing
`chrome.runtime.onMessage.addListener(...)` callback, before the closing `});`:

```js
  if (msg?.type === 'SAVE_WINDOW') {
    chrome.tabs.query({ windowId: msg.windowId }).then((tabs) => {
      const urls = tabs.map((t) => t.url);
      chrome.storage.local.set({ savedWindow: urls }).then(() => sendResponse({ ok: true, count: urls.length }));
    });
    return true; // async response
  }
```

- [ ] **Step 2: Write the E2E test**

Create `tests/integration/save-window.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

// Proves the window/tabs primitive end-to-end WITHOUT relying on openForTab:
// seed a real window with known tabs → ask the SW to save that window's tabs → assert storage.
test('saving a seeded window persists its tab URLs to storage', async ({ ext }) => {
  const urls = [ext.url('options.html'), ext.url('popup.html')];
  const handle = await ext.windows.create({ tabs: urls });

  await ext.background.sendMessage({ type: 'SAVE_WINDOW', windowId: handle.id });

  await expect(ext.storage.local).toEventuallyHaveStorageValue(
    'savedWindow',
    expect.arrayContaining(urls),
  );
});
```

- [ ] **Step 3: Run it to verify it passes**

Run: `npx playwright test tests/integration/save-window.spec.ts`
Expected: PASS. (Depends on Tasks 2 + 4.)

- [ ] **Step 4: Stability check**

Run: `npx playwright test tests/integration/save-window.spec.ts --repeat-each=5`
Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add fixtures/ext/background.js tests/integration/save-window.spec.ts
git commit -m "test(windows): prove save-current-window's-tabs end-to-end (§A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `openForTab` hardening (§C / P1.6)

**Files:**
- Modify: `src/helpers/popup.ts`
- Create: `tests/integration/open-for-tab.spec.ts`

- [ ] **Step 1: Add a retry + `@experimental` marker**

In `src/helpers/popup.ts`, update the `openForTab` JSDoc to mark it experimental and add a modest retry around the focus + `openPopup` attempt. Replace the existing `openForTab` method body so the focus/openPopup sequence is attempted up to 2 times before throwing. Concretely:

- Prepend to the JSDoc (keep the existing lines): a first line `@experimental — best-effort; most reliable headed or against a freshly created focused window (see ext.windows.create({ focused: true })).`
- Wrap the `this.ext.background.evaluate(async () => { … })` focus/openPopup call in a loop:

```ts
  async openForTab(activeTab: Page, popupPath?: string): Promise<Page> {
    await activeTab.bringToFront();
    const resolvedPath = this.resolvePopupPath(popupPath);
    const prefix = this.ext.url('');
    const opened = this.ext.context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(prefix + resolvedPath),
      timeout: 5_000,
    });

    const attempt = async (): Promise<string | null> =>
      this.ext.background.evaluate(async () => {
        try {
          const win = await chrome.windows.getLastFocused();
          if (win.id !== undefined) await chrome.windows.update(win.id, { focused: true });
          await chrome.action.openPopup(win.id !== undefined ? { windowId: win.id } : undefined);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      });

    let lastError = await attempt();
    if (lastError) lastError = await attempt(); // one retry — focus can lag in headless

    if (lastError) {
      opened.catch(() => {});
      throw new CrxboxError({ code: 'popup/no-active-tab', popupPath: resolvedPath, cause: lastError });
    }
    return opened.catch(() => {
      throw new CrxboxError({ code: 'popup/no-active-tab', popupPath: resolvedPath });
    });
  }
```

(Keep the `CrxboxError` import already present in the file.)

- [ ] **Step 2: Write a tolerant integration test**

Create `tests/integration/open-for-tab.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';
import { CrxboxError } from '../../src/index.js';

test.use({ extensionPath: EXT_PATH });

// openForTab is @experimental/best-effort: in new-headless it may take the
// documented popup/no-active-tab throw path. This test asserts the CONTRACT —
// either a bound popup page, or the structured diagnostic — so it documents
// behavior without flaking. Recommended usage: bind against a created focused window.
test('openForTab binds the popup or throws the documented diagnostic', async ({ ext }) => {
  const win = await ext.windows.create({ tabs: [ext.url('popup.html')], focused: true });
  const result = await ext.popup.openForTab(win.tabs[0]!).catch((e) => e);

  if (result instanceof CrxboxError) {
    expect(result.diagnostic.code).toBe('popup/no-active-tab');
  } else {
    expect(result.url()).toContain(ext.url(''));
  }
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test tests/integration/open-for-tab.spec.ts`
Expected: PASS (either branch is acceptable by design).

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/popup.ts tests/integration/open-for-tab.spec.ts
git commit -m "feat(popup): retry + @experimental marker for openForTab (§C/P1.6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Migration/update simulation — spike + docs (§D / P1.5)

**Files:**
- Modify: `docs/API.md` (recipe + boundary)
- Modify: `src/skill/SKILL.md` (recipe + boundary)
- (Conditional) Create: `src/helpers/...` + test, only if the spike finds a clean mechanism.

This task has an investigation gate. **Do not invent an API that doesn't work.**

- [ ] **Step 1: Spike feasibility (timeboxed; write findings into the commit message)**

Investigate, in a scratch spec you will NOT commit, whether `chrome.runtime.onInstalled`
with `reason: 'update'` can be triggered synthetically. Try each and record the result:
1. Inspecting `chrome.runtime.onInstalled` in the SW via `ext.background.evaluate(() => Object.keys(chrome.runtime.onInstalled))` — is there a `dispatch`/test affordance? (Expected: no.)
2. `ext.background.evaluate(() => chrome.runtime.reload())` — does `onInstalled` fire with `reason:'update'` afterwards? (Expected: no — reload does not re-fire onInstalled as 'update'.)
3. Any CDP affordance via `context.newCDPSession` (e.g. an `Extensions`/`ServiceWorker` domain method). (Expected: none usable.)

Delete the scratch spec when done.

- [ ] **Step 2: Decision gate**

- **If NO clean mechanism (expected):** proceed to Step 3 (docs-only). Do not add an API.
- **If a clean, generic mechanism exists:** STOP and report `DONE_WITH_CONCERNS` describing it, so the controller can decide whether to expand scope to a real `ext.simulateUpdate({ previousVersion })` helper with a test. Do not build it unsolicited.

- [ ] **Step 3: Document the recipe + boundary (docs-only path)**

Add a "Simulating an extension update / migration" subsection to `docs/API.md` and a
matching `§ Migration` note to `src/skill/SKILL.md` with this guidance (adapt wording to each file's style):

> crxbox cannot synthetically fire `chrome.runtime.onInstalled` (the event object exposes no
> dispatch in production), so migration logic gated *purely* on `onInstalled({reason:'update'})`
> is unreachable from the consumer side. Test the migration **work** instead of its trigger:
> 1. Seed the pre-update state, including whatever version marker your code compares — e.g.
>    `await ext.storage.local.set({ schemaVersion: '3.9.0', /* legacy data */ });`
> 2. Drive the migration entry point directly. If your SW exposes it as a message
>    (`{ type: 'RUN_MIGRATION' }`) use `await ext.background.sendMessage(...)`; otherwise call
>    it via `await ext.background.evaluate(() => globalThis.runMigration?.())` if it is reachable.
> 3. Assert the repaired state with `expect(ext.storage.local).toEventuallyHaveStorageValue(...)`.
>
> If migration only runs inside an `onInstalled` listener with no other entry point, refactor the
> extension to expose a callable migration function — that also makes it unit-testable.

- [ ] **Step 4: Build (docs copied) + commit**

Run: `npm run build` → success.

```bash
git add docs/API.md src/skill/SKILL.md
git commit -m "docs: migration/update testing recipe + onInstalled boundary (§D/P1.5)

Spike: chrome.runtime.onInstalled cannot be fired synthetically (no dispatch on
the production event; reload does not re-fire as 'update'; no usable CDP path).
Shipping a documented recipe (seed version marker + drive migration entry point)
instead of an API.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Docs & release polish (§E / P0.1, P0.2, P2.7, P2.9)

**Files:**
- Modify: `README.md`
- Modify: `docs/API.md`
- Modify: `src/skill/SKILL.md`
- Create: `docs/fixture-extension.md`
- Create: `CHANGELOG.md`
- Modify: `package.json`

Read each file first to match its style. Then:

- [ ] **Step 1: README — lead with the packaging/consumption contract (P0.1)**

Near the top (right after the intro / before or within "Requirements"/"Install"), add a
prominent **Consuming crxbox** subsection stating:
- crxbox must share the consumer's **single `@playwright/test`** instance (peer dependency).
- Install with the consumer's package manager: npm/yarn/pnpm one-liners
  (`npm i -D crxbox @playwright/test`, `yarn add -D …`, `pnpm add -D …`), plus
  `npx playwright install chromium`.
- Until published, consume as a **packed tarball** (`npm pack` → `file:` path), **not** a
  live dev-checkout symlink (that triggers the `loader/duplicate-playwright` crash).
- Keep/point to the `loader/duplicate-playwright` diagnostic.

- [ ] **Step 2: README — add a trace/debug recipe (P2.9)**

Add a short **Debugging** section: run headed and paced and with the inspector/trace —
```bash
# watch it run
npx playwright test --headed
PWDEBUG=1 npx playwright test          # Playwright Inspector
# slow it down (via your playwright config use.launchOptions.slowMo, forwarded by crxbox)
# record a trace
npx playwright test --trace on && npx playwright show-trace
```
Note that crxbox forwards `--headed`/`PWDEBUG`/`channel`/`slowMo`/`use.launchOptions`.

- [ ] **Step 3: Create `docs/fixture-extension.md` (P0.2 — make the flagship visible)**

Write a reference doc describing the in-repo example extension and the proof it provides:
- `fixtures/ext/` is a complete MV3 example: popup (`popup.html`/`popup.js`), a **content
  script** (`content.js`) that injects a **shadow-DOM root** and an **iframe** UI, an options
  page (`options.html`), a background SW (`background.js`), and DnD/dialog/window fixtures.
- `tests/integration/content-ui.spec.ts` exercises `ext.contentUi()` against the real injected
  shadow root and iframe (and the not-injected / wrong-frame diagnostics) — so the flagship
  content-UI path is proven first-party, independent of any adopted app.
- Point adopters at it as a copyable reference for their own setup.
- Link this doc from README.

- [ ] **Step 4: `docs/API.md` + `src/skill/SKILL.md` — document the new API**

Add reference entries / skill bullets for:
- `ext.windows.create(opts?)` → `WindowHandle` ({ id, tabs: Page[], focus(), close() }); seeded
  tabs become Page handles; lifecycle (torn down with the per-test context; `handle.close()` for
  mid-test). Note `window/create-failed`.
- `ext.tabs.create(url, opts?)` / `query(filter?)` → `TabInfo[]` / `close(page|id)`. Note `tabs/not-found`.
- The two new matchers: `toEventuallyHaveStorageValue(key, expected, opts?)` and
  `toHaveStorageKeys(keys)` (subset).
- `openForTab` is `@experimental`; recommended pattern: `const w = await ext.windows.create({ focused: true }); await ext.popup.openForTab(w.tabs[0]);`
- Add `window/create-failed` and `tabs/not-found` to the SKILL.md failure-codes table.
- (The migration recipe from Task 7 already lives here.)

- [ ] **Step 5: Create `CHANGELOG.md`**

Use Keep a Changelog format:

```markdown
# Changelog

All notable changes to crxbox are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-08

### Added
- `ext.windows.create()` / `ext.tabs` (create/query/close) — seed a real browser window with
  known tabs and drive active-tab / "save current window" flows.
- Storage matchers: `toEventuallyHaveStorageValue` (polling) and `toHaveStorageKeys` (subset).
- `ext.openPage()`, `ext.acceptDialogs()`, `ext.dragAndDrop()`.
- Opt-in popup viewport: `popup.open(path, { viewport })` + fixture `popupViewport`.
- Launch-config forwarding: `headless`/`--headed`/`PWDEBUG`/`channel`/`slowMo`/`use.launchOptions`.
- Diagnostics: `loader/duplicate-playwright`, `drag/no-bounding-box`, `drag/cross-page`,
  `window/create-failed`, `tabs/not-found`.
- `docs/fixture-extension.md` — first-party example extension reference; trace/debug recipe;
  migration-testing recipe.

### Changed
- `popup.open()` / `openForTab()` default to the manifest's `action.default_popup`.
- `openForTab` is marked `@experimental` and retries the focus/openPopup sequence once.

### Notes
- Pre-1.0: the API may still change. Consume as a published or `npm pack`ed tarball sharing the
  consumer's single `@playwright/test` instance (not a live dev-checkout symlink).
```

- [ ] **Step 6: Bump the version**

In `package.json`, change `"version": "0.0.0"` to `"version": "0.1.0"`.

- [ ] **Step 7: Build + commit**

Run: `npm run build` → success.

```bash
git add README.md docs/API.md src/skill/SKILL.md docs/fixture-extension.md CHANGELOG.md package.json
git commit -m "docs(release): packaging-first README, trace recipe, fixture reference, CHANGELOG, v0.1.0 (§E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Full verification + build

**Files:** none (verification only)

- [ ] **Step 1: Unit suite** — `npm run test:unit` → all pass.
- [ ] **Step 2: Integration suite** — `npm run test:int` → all pass (incl. tabs, windows, save-window, storage-matchers, open-for-tab).
- [ ] **Step 3: Typecheck/lint/build** — `npm run typecheck && npm run lint && npm run build` → all clean.
- [ ] **Step 4: Built API sanity** —
```bash
node --input-type=module -e "import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(', ')))"
```
Expected: includes `TabsHelper`, `WindowsHelper` alongside the existing exports. (`WindowHandle`/`TabInfo` are type-only and won't appear at runtime.)

> If green, use `superpowers:finishing-a-development-branch`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- A (windows/tabs) → Tasks 3, 4, 5 (+ diagnostics Task 1). ✓
- B (matchers) → Task 2. ✓
- C (openForTab hardening) → Task 6. ✓
- D (migration sim — investigate) → Task 7 (spike → docs, conditional helper gate). ✓
- E (docs/release: packaging, trace, fixture reference, CHANGELOG, version) → Task 8. ✓
- P0.2 reframed as visibility → `docs/fixture-extension.md` in Task 8. ✓

**Type consistency:** `TabsHelper`/`TabInfo`/`toUrl` (tabs.ts), `WindowsHelper`/`WindowHandle`
(windows.ts) used identically across tasks/exports; `ext.tabs`/`ext.windows` fields;
matcher names `toEventuallyHaveStorageValue`/`toHaveStorageKeys` match between matchers.ts,
the type augmentation, and tests; diagnostic codes `window/create-failed`/`tabs/not-found`
consistent. ✓

**Ordering:** matchers (Task 2) precede the headline E2E (Task 5) which uses
`toEventuallyHaveStorageValue`; tabs (Task 3) precede windows (Task 4) which delegates to
`ext.tabs.create`; both precede Task 5. ✓

**Placeholder scan:** every code step has complete code; the docs/spike task specifies exact
recipe content and an explicit decision gate rather than "investigate" hand-waving. ✓
