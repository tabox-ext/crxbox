# Tabox-Feedback Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the code fixes, new helper APIs, and documentation called for in the Tabox feedback log, each with regression coverage.

**Architecture:** crxbox is a small ESM-only Playwright wrapper for Chrome-extension testing. Pure logic (launch-option merging, duplicate-Playwright detection, pointer choreography) is factored into testable functions covered by Vitest unit tests; browser-facing behavior (popup viewport, page opening, dialog handling, drag-and-drop) is covered by Playwright integration tests against the in-repo fixture extension at `fixtures/ext/`. New public surface is added to `src/ext.ts` and re-exported from `src/index.ts` with no breaking changes.

**Tech Stack:** TypeScript (ES2022, ESM), `@playwright/test` (peer dep), Vitest (unit), Playwright (integration), tsup (build).

**Spec:** `docs/superpowers/specs/2026-06-07-tabox-feedback-batch-design.md`

**Commit convention:** This repo uses Conventional Commits. End every commit message body with the trailer:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## File Structure

**Modify:**
- `src/diagnostics.ts` — add `'loader/duplicate-playwright'` code + hint.
- `src/loader.ts` — extract `buildPersistentContextOptions`; add `findDuplicatePlaywright` + `assertSinglePlaywright`; call the assert in `launchWithExtension`.
- `src/helpers/popup.ts` — `PopupOpenOptions`; `open(popupPath?, opts?)` applies a viewport.
- `src/ext.ts` — `ExtOptions.popupViewport`; new methods `openPage`, `acceptDialogs`, `dragAndDrop`.
- `src/fixtures.ts` — `CrxboxOptions.popupViewport` fixture option, threaded into `Ext`.
- `src/index.ts` — export `PopupOpenOptions`, `DragOptions`, `dragAndDrop`.
- `README.md`, `docs/API.md`, `skill/SKILL.md` — docs sweep.

**Create:**
- `src/interactions.ts` — pure `dragAndDrop(source, target, opts)` pointer choreography + `DragOptions`.
- `tests/unit/loader.test.ts` — unit tests for `buildPersistentContextOptions` + `findDuplicatePlaywright`.
- `tests/integration/launch-options.spec.ts` — args-append load check.
- `tests/integration/popup-viewport.spec.ts` — per-call + fixture-default viewport.
- `tests/integration/open-page.spec.ts` — `ext.openPage`.
- `tests/integration/dialogs.spec.ts` — `ext.acceptDialogs`.
- `tests/integration/drag-and-drop.spec.ts` — `ext.dragAndDrop`.
- `fixtures/ext/options.html` — a non-popup extension page (for `openPage`).
- `fixtures/ext/confirm.html` + `fixtures/ext/confirm.js` — confirm-gated button (for `acceptDialogs`).
- `fixtures/ext/dnd.html` + `fixtures/ext/dnd.js` — activation-distance sortable list (for `dragAndDrop`).

---

## Task 1: Extract `buildPersistentContextOptions` + unit tests (§4)

**Files:**
- Modify: `src/loader.ts`
- Create: `tests/unit/loader.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/loader.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPersistentContextOptions } from '../../src/loader';

const EXT = '/tmp/my-ext';

describe('buildPersistentContextOptions', () => {
  it('injects the two required extension args pointing at extPath', () => {
    const out = buildPersistentContextOptions(EXT);
    expect(out.args).toEqual([
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ]);
  });

  it('defaults channel to chromium and lets the caller override it', () => {
    expect(buildPersistentContextOptions(EXT).channel).toBe('chromium');
    expect(buildPersistentContextOptions(EXT, { channel: 'chrome' }).channel).toBe('chrome');
  });

  it('appends caller args after the required extension args (does not replace them)', () => {
    const out = buildPersistentContextOptions(EXT, { args: ['--lang=en-US'] });
    expect(out.args).toEqual([
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--lang=en-US',
    ]);
  });

  it('passes through headless, slowMo, and devtools untouched', () => {
    const out = buildPersistentContextOptions(EXT, { headless: false, slowMo: 250, devtools: true });
    expect(out.headless).toBe(false);
    expect(out.slowMo).toBe(250);
    expect(out.devtools).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/loader.test.ts`
Expected: FAIL — `buildPersistentContextOptions` is not exported from `src/loader.ts`.

- [ ] **Step 3: Add the pure helper and use it in `launchWithExtension`**

In `src/loader.ts`, add this function directly above `launchWithExtension`:

```ts
/**
 * Build the final `launchPersistentContext` options: crxbox's two required
 * extension args always come first, the caller's `args` are appended (never
 * replaced), `channel` defaults to `'chromium'` but is overridable, and every
 * other Playwright launch option (`headless`, `slowMo`, `devtools`, …) passes
 * through untouched. Pure + exported so the merge contract is unit-tested.
 */
export function buildPersistentContextOptions(
  extPath: string,
  launchOptions?: LaunchOptions,
): LaunchOptions {
  const { args: userArgs = [], channel, ...rest } = launchOptions ?? {};
  return {
    channel: channel ?? 'chromium',
    ...rest,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      ...userArgs,
    ],
  };
}
```

Then replace the inline merge in `launchWithExtension` (currently lines 34-44) with a call to it:

```ts
  return chromium.launchPersistentContext('', buildPersistentContextOptions(extPath, opts.launchOptions));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/loader.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/loader.ts tests/unit/loader.test.ts
git commit -m "refactor(loader): extract buildPersistentContextOptions + unit tests

Makes the launch-option merge contract (channel default, args append,
passthrough) regression-proof per Tabox feedback §4.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Integration test — caller args are merged, not dropped (§4)

**Files:**
- Create: `tests/integration/launch-options.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/launch-options.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

// A caller-supplied launch arg must be APPENDED to crxbox's required extension
// args, not replace them — if it replaced them, the extension would not load
// and ext.id would never resolve.
test.use({ extensionPath: EXT_PATH, launchOptions: { args: ['--lang=en-US'] } });

test('forwards launchOptions.args while still loading the extension', async ({ ext }) => {
  expect(ext.id).toMatch(/^[a-p]{32}$/);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/integration/launch-options.spec.ts`
Expected: PASS — the extension loads with the extra arg present (Task 1's append logic).

> If this somehow fails to resolve an id, the regression is real — the merge dropped crxbox's args. Do not weaken the assertion; fix the merge.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/launch-options.spec.ts
git commit -m "test(loader): assert launchOptions.args are merged, not clobbered

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `loader/duplicate-playwright` diagnostic (§1)

**Files:**
- Modify: `src/diagnostics.ts`
- Modify: `src/loader.ts`
- Modify: `tests/unit/loader.test.ts`
- Modify: `tests/unit/diagnostics.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Append to `tests/unit/loader.test.ts`:

```ts
import { findDuplicatePlaywright } from '../../src/loader';

describe('findDuplicatePlaywright', () => {
  it('returns the offending pair when the two resolved paths differ', () => {
    expect(
      findDuplicatePlaywright('/a/node_modules/@playwright/test', '/b/node_modules/@playwright/test'),
    ).toEqual({
      crxboxPath: '/a/node_modules/@playwright/test',
      consumerPath: '/b/node_modules/@playwright/test',
    });
  });

  it('returns null when both paths are identical (single shared instance)', () => {
    expect(findDuplicatePlaywright('/same/path', '/same/path')).toBeNull();
  });

  it('returns null when either path could not be resolved', () => {
    expect(findDuplicatePlaywright(null, '/b')).toBeNull();
    expect(findDuplicatePlaywright('/a', null)).toBeNull();
  });
});
```

Append to `tests/unit/diagnostics.test.ts` (inside the existing file, after the `CrxboxError` describe block):

```ts
import { findDuplicatePlaywright as _unused } from '../../src/loader'; // (no-op import guard not needed; remove if lint complains)

describe('loader/duplicate-playwright hint', () => {
  it('renders a hint for the duplicate-playwright code', () => {
    const err = new CrxboxError({
      code: 'loader/duplicate-playwright',
      crxboxPath: '/a',
      consumerPath: '/b',
    });
    expect(err.message).toContain('hint:');
    expect(err.diagnostic.code).toBe('loader/duplicate-playwright');
  });
});
```

> Note: if eslint flags the `_unused` import in `diagnostics.test.ts`, delete that import line — it is not needed; it was only a copy guard. The `CrxboxError` import already exists at the top of that file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/loader.test.ts tests/unit/diagnostics.test.ts`
Expected: FAIL — `findDuplicatePlaywright` not exported; `'loader/duplicate-playwright'` not a valid `DiagnosticCode`.

- [ ] **Step 3: Add the diagnostic code + hint**

In `src/diagnostics.ts`, add the code to the `DiagnosticCode` union (after `'loader/sw-timeout'`):

```ts
  | 'loader/duplicate-playwright'
```

And add the matching `HINTS` entry (after the `'loader/sw-timeout'` entry):

```ts
  'loader/duplicate-playwright':
    "two @playwright/test copies were resolved (crxbox vs consumer) — crxbox must share the consumer's single instance. Consume crxbox as a published or `npm pack`ed tarball, or dedupe so only one @playwright/test exists; do not live-symlink a dev checkout that ships its own node_modules.",
```

- [ ] **Step 4: Add `findDuplicatePlaywright` + `assertSinglePlaywright` to the loader**

In `src/loader.ts`, add the `createRequire` import at the top (with the other `node:` imports):

```ts
import { createRequire } from 'node:module';
```

Add these two functions (place them above `launchWithExtension`):

```ts
/**
 * Pure comparison: given the `@playwright/test` path resolved from crxbox's own
 * module and the one resolved from the consumer, return the offending pair when
 * they differ (two distinct copies → Playwright's "Requiring second time" crash),
 * or null when they match / either could not be resolved.
 */
export function findDuplicatePlaywright(
  crxboxPath: string | null,
  consumerPath: string | null,
): { crxboxPath: string; consumerPath: string } | null {
  if (!crxboxPath || !consumerPath || crxboxPath === consumerPath) return null;
  return { crxboxPath, consumerPath };
}

/**
 * Best-effort guard against the single biggest adoption papercut: two
 * @playwright/test instances on disk (e.g. a live-symlinked dev checkout that
 * ships its own node_modules). Resolves the module from crxbox's own location
 * and from the consumer's cwd; if they realpath to different files, throws a
 * crxbox diagnostic instead of letting Playwright fail cryptically. If either
 * side can't be resolved, the check is skipped — it must never mask a real launch.
 */
export function assertSinglePlaywright(): void {
  let crxboxPath: string | null = null;
  let consumerPath: string | null = null;
  try {
    crxboxPath = fs.realpathSync(createRequire(import.meta.url).resolve('@playwright/test'));
    const consumerRequire = createRequire(path.join(process.cwd(), '__crxbox_probe__.js'));
    consumerPath = fs.realpathSync(consumerRequire.resolve('@playwright/test'));
  } catch {
    return; // couldn't resolve from one side — skip the best-effort check
  }
  const dup = findDuplicatePlaywright(crxboxPath, consumerPath);
  if (dup) {
    throw new CrxboxError({
      code: 'loader/duplicate-playwright',
      crxboxPath: dup.crxboxPath,
      consumerPath: dup.consumerPath,
    });
  }
}
```

Then call it as the very first line inside `launchWithExtension`:

```ts
export async function launchWithExtension(opts: LoadOptions): Promise<BrowserContext> {
  assertSinglePlaywright();
  if (!opts.path) {
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `npx vitest run tests/unit/loader.test.ts tests/unit/diagnostics.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify crxbox's own integration suite still launches (no false positive)**

Run: `npx playwright test tests/integration/loader.spec.ts`
Expected: PASS — in this repo both resolutions point at the single workspace `@playwright/test`, so `assertSinglePlaywright()` is a no-op and the extension still loads.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/diagnostics.ts src/loader.ts tests/unit/loader.test.ts tests/unit/diagnostics.test.ts
git commit -m "feat(loader): diagnose duplicate @playwright/test instances

Adds loader/duplicate-playwright — a best-effort check that throws a clear
crxbox error when crxbox and the consumer resolve different @playwright/test
copies, instead of Playwright's cryptic 'Requiring second time' crash (§1).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Opt-in popup viewport (§5)

**Files:**
- Modify: `src/helpers/popup.ts`
- Modify: `src/ext.ts`
- Modify: `src/fixtures.ts`
- Modify: `src/index.ts`
- Create: `tests/integration/popup-viewport.spec.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/popup-viewport.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.describe('per-call viewport', () => {
  test.use({ extensionPath: EXT_PATH });

  test('open({ viewport }) sizes the popup page', async ({ ext }) => {
    const popup = await ext.popup.open(undefined, { viewport: { width: 360, height: 600 } });
    expect(popup.viewportSize()).toEqual({ width: 360, height: 600 });
  });

  test('default open() keeps Playwright default viewport (no breaking change)', async ({ ext }) => {
    const popup = await ext.popup.open();
    expect(popup.viewportSize()).toEqual({ width: 1280, height: 720 });
  });
});

test.describe('fixture popupViewport default', () => {
  test.use({ extensionPath: EXT_PATH, popupViewport: { width: 400, height: 500 } });

  test('open() uses the configured popupViewport when no per-call viewport given', async ({ ext }) => {
    const popup = await ext.popup.open();
    expect(popup.viewportSize()).toEqual({ width: 400, height: 500 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/integration/popup-viewport.spec.ts`
Expected: FAIL — `open()` takes no second arg; `popupViewport` is not a known fixture option (type error / unused).

- [ ] **Step 3: Add `PopupOpenOptions` and apply the viewport in `popup.open`**

In `src/helpers/popup.ts`, add the exported options type above the class:

```ts
export interface PopupOpenOptions {
  /** Size the popup page to mimic a real Chrome action popup (default: Playwright's viewport). */
  viewport?: { width: number; height: number };
}
```

Replace the existing `open` method with:

```ts
  /**
   * popup-as-page: open the popup in a normal page for logic/UI assertions (~90% of cases).
   * Defaults to the manifest's `action.default_popup` when `popupPath` is omitted.
   * Pass `{ viewport }` (or set the fixture `popupViewport`) to mimic a real popup's
   * small dimensions for layout-sensitive assertions.
   */
  async open(popupPath?: string, opts?: PopupOpenOptions): Promise<Page> {
    const page = await this.ext.context.newPage();
    const viewport = opts?.viewport ?? this.ext.options.popupViewport;
    if (viewport) await page.setViewportSize(viewport);
    await page.goto(this.ext.url(this.resolvePopupPath(popupPath)));
    return page;
  }
```

- [ ] **Step 4: Add `popupViewport` to `ExtOptions`**

In `src/ext.ts`, add to the `ExtOptions` interface (after `key?`):

```ts
  /** Default viewport applied by `popup.open()` when no per-call viewport is given. */
  popupViewport?: { width: number; height: number };
```

- [ ] **Step 5: Thread `popupViewport` through the fixtures**

In `src/fixtures.ts`:

Add to the `CrxboxOptions` interface (after `extensionKey?`):

```ts
  /**
   * Default viewport for `ext.popup.open()` — pin it to your extension's real
   * popup dimensions so layout-sensitive assertions match production. A per-call
   * `open({ viewport })` overrides this.
   */
  popupViewport?: { width: number; height: number };
```

Change the `createExtensionFixtures` signature to accept the new config field:

```ts
export function createExtensionFixtures(
  config: { path?: string; key?: string; popupViewport?: { width: number; height: number } } = {},
) {
```

Register it as an option fixture (after the `extensionKey` line):

```ts
    popupViewport: [config.popupViewport, { option: true }],
```

Destructure it in the `ext` fixture and pass it to `Ext`:

```ts
    ext: async (
      { context, extensionPath, extensionKey, popupViewport }: CrxboxFixtures & CrxboxOptions,
      use: (e: Ext) => Promise<void>,
    ) => {
      const id = await resolveExtensionId(context);
      const ext = new Ext(context, id, { path: extensionPath, key: extensionKey, popupViewport });
      await ext.storage.clearAll(); // reset state between tests
      await use(ext);
    },
```

- [ ] **Step 6: Export `PopupOpenOptions`**

In `src/index.ts`, change the popup export line to also export the type:

```ts
export { PopupHelper } from './helpers/popup.js';
export type { PopupOpenOptions } from './helpers/popup.js';
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/integration/popup-viewport.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/helpers/popup.ts src/ext.ts src/fixtures.ts src/index.ts tests/integration/popup-viewport.spec.ts
git commit -m "feat(popup): opt-in viewport for popup.open() + fixture popupViewport (§5)

Default viewport unchanged; pass { viewport } per call or set popupViewport
in config to mimic a real action popup's small dimensions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `ext.openPage(path, opts?)` helper (§13)

**Files:**
- Create: `fixtures/ext/options.html`
- Modify: `src/ext.ts`
- Create: `tests/integration/open-page.spec.ts`

- [ ] **Step 1: Add a non-popup fixture page**

Create `fixtures/ext/options.html`:

```html
<!doctype html>
<html>
  <body>
    <h1 id="title">Options Page</h1>
  </body>
</html>
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/open-page.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('openPage() opens a non-popup extension page and returns the Page', async ({ ext }) => {
  const page = await ext.openPage('options.html');
  await expect(page.locator('#title')).toHaveText('Options Page');
});

test('openPage() applies an optional viewport', async ({ ext }) => {
  const page = await ext.openPage('options.html', { viewport: { width: 500, height: 400 } });
  expect(page.viewportSize()).toEqual({ width: 500, height: 400 });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test tests/integration/open-page.spec.ts`
Expected: FAIL — `ext.openPage` is not a function.

- [ ] **Step 4: Add `openPage` to `Ext`**

In `src/ext.ts`, add this method to the `Ext` class (after `url`):

```ts
  /**
   * Open any extension page (options page, full-page view, sandbox) as a normal
   * page and return it — the neutral sibling of `popup.open()` for non-popup pages.
   */
  async openPage(p: string, opts?: { viewport?: { width: number; height: number } }): Promise<Page> {
    const page = await this.context.newPage();
    if (opts?.viewport) await page.setViewportSize(opts.viewport);
    await page.goto(this.url(p));
    return page;
  }
```

(`Page` is already imported at the top of `src/ext.ts`.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test tests/integration/open-page.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add fixtures/ext/options.html src/ext.ts tests/integration/open-page.spec.ts
git commit -m "feat(ext): add ext.openPage() for non-popup extension pages (§13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `ext.acceptDialogs(page)` helper (§7)

**Files:**
- Create: `fixtures/ext/confirm.html`, `fixtures/ext/confirm.js`
- Modify: `src/ext.ts`
- Create: `tests/integration/dialogs.spec.ts`

- [ ] **Step 1: Add a confirm-gated fixture page**

Create `fixtures/ext/confirm.html`:

```html
<!doctype html>
<html>
  <body>
    <button id="del">Delete</button>
    <div id="status">idle</div>
    <script src="confirm.js"></script>
  </body>
</html>
```

Create `fixtures/ext/confirm.js`:

```js
document.getElementById('del').addEventListener('click', () => {
  const ok = window.confirm('Are you sure?');
  document.getElementById('status').textContent = ok ? 'deleted' : 'cancelled';
});
```

- [ ] **Step 2: Write the failing integration tests**

Create `tests/integration/dialogs.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('without acceptDialogs, Playwright auto-dismisses confirm() (action cancelled)', async ({ ext }) => {
  const page = await ext.openPage('confirm.html');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#status')).toHaveText('cancelled');
});

test('acceptDialogs(page) makes confirm() return true so the action proceeds', async ({ ext }) => {
  const page = await ext.openPage('confirm.html');
  ext.acceptDialogs(page);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#status')).toHaveText('deleted');
});

test('the returned disposer detaches the handler', async ({ ext }) => {
  const page = await ext.openPage('confirm.html');
  const stop = ext.acceptDialogs(page);
  stop();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#status')).toHaveText('cancelled');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx playwright test tests/integration/dialogs.spec.ts`
Expected: FAIL — `ext.acceptDialogs` is not a function. (The first test may pass already, since auto-dismiss is the default — that's expected.)

- [ ] **Step 4: Add `acceptDialogs` to `Ext`**

In `src/ext.ts`, add `Dialog` to the type import at the top:

```ts
import type { BrowserContext, Dialog, Page } from '@playwright/test';
```

Add this method to the `Ext` class (after `openPage`):

```ts
  /**
   * Auto-accept every dialog (confirm/alert/prompt) on a page. Extension flows
   * gate destructive actions behind `window.confirm`; Playwright's default is to
   * dismiss unhandled dialogs, silently aborting the action. Returns a disposer
   * that detaches the handler.
   */
  acceptDialogs(page: Page): () => void {
    const handler = (dialog: Dialog) => {
      void dialog.accept();
    };
    page.on('dialog', handler);
    return () => page.off('dialog', handler);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test tests/integration/dialogs.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add fixtures/ext/confirm.html fixtures/ext/confirm.js src/ext.ts tests/integration/dialogs.spec.ts
git commit -m "feat(ext): add ext.acceptDialogs() for confirm/alert flows (§7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `ext.dragAndDrop(source, target, opts?)` helper (§8)

**Files:**
- Create: `src/interactions.ts`
- Create: `fixtures/ext/dnd.html`, `fixtures/ext/dnd.js`
- Modify: `src/ext.ts`
- Modify: `src/index.ts`
- Create: `tests/integration/drag-and-drop.spec.ts`

- [ ] **Step 1: Create the pure pointer-choreography module**

Create `src/interactions.ts`:

```ts
import type { Locator } from '@playwright/test';

export interface DragOptions {
  /** Number of intermediate moves while gliding onto the target (default 12). */
  steps?: number;
  /** Pixels to nudge past the source center to exceed an activation distance (default 8). */
  nudge?: number;
  /** Pixels of final settle past the target center (default 4). */
  settle?: number;
}

/**
 * Robust pointer-based drag that reliably trips activation-distance sensors
 * (dnd-kit, react-dnd, etc.) where Playwright's single-move `locator.dragTo()`
 * no-ops: press → nudge past activation → stepped glide → settle → release.
 */
export async function dragAndDrop(
  source: Locator,
  target: Locator,
  opts: DragOptions = {},
): Promise<void> {
  const { steps = 12, nudge = 8, settle = 4 } = opts;
  const page = source.page();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error(
      'crxbox.dragAndDrop: source or target has no bounding box (not visible/attached).',
    );
  }
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(fx, fy + nudge); // exceed the activation distance
  await page.mouse.move(tx, ty, { steps }); // glide onto the target
  await page.mouse.move(tx, ty + settle, { steps: Math.max(2, Math.ceil(steps / 3)) }); // settle past center
  await page.mouse.up();
}
```

- [ ] **Step 2: Add an activation-distance sortable fixture**

Create `fixtures/ext/dnd.html`:

```html
<!doctype html>
<html>
  <body>
    <ul id="list" style="list-style: none; padding: 0; margin: 0; width: 200px;">
      <li data-item="a" style="height: 40px; border: 1px solid #ccc;">Item A</li>
      <li data-item="b" style="height: 40px; border: 1px solid #ccc;">Item B</li>
      <li data-item="c" style="height: 40px; border: 1px solid #ccc;">Item C</li>
    </ul>
    <script src="dnd.js"></script>
  </body>
</html>
```

Create `fixtures/ext/dnd.js` (a vanilla mimic of dnd-kit's 5px activation distance — a single press→drop does NOT activate it; only movement past 5px does):

```js
const list = document.getElementById('list');
let dragging = null;
let startX = 0;
let startY = 0;
let activated = false;

list.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('[data-item]');
  if (!item) return;
  dragging = item;
  startX = e.clientX;
  startY = e.clientY;
  activated = false;
});

window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (!activated && Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
    activated = true; // crossed the activation distance — drag really starts
  }
});

window.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  if (activated) {
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-item]');
    if (under && under !== dragging) under.after(dragging); // drop after the target row
  }
  dragging = null;
  activated = false;
});
```

- [ ] **Step 3: Write the failing integration test**

Create `tests/integration/drag-and-drop.spec.ts`:

```ts
import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

const readOrder = (page: import('@playwright/test').Page) =>
  page.locator('[data-item]').evaluateAll((els) => els.map((el) => el.getAttribute('data-item')));

test('dragAndDrop reorders an activation-distance sortable list', async ({ ext }) => {
  const page = await ext.openPage('dnd.html');
  expect(await readOrder(page)).toEqual(['a', 'b', 'c']);

  await ext.dragAndDrop(page.locator('[data-item="a"]'), page.locator('[data-item="c"]'));

  // A was dropped after C → B, C, A
  expect(await readOrder(page)).toEqual(['b', 'c', 'a']);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx playwright test tests/integration/drag-and-drop.spec.ts`
Expected: FAIL — `ext.dragAndDrop` is not a function.

- [ ] **Step 5: Wire `dragAndDrop` onto `Ext`**

In `src/ext.ts`, add `Locator` to the type import and import the interactions helper:

```ts
import type { BrowserContext, Dialog, Locator, Page } from '@playwright/test';
import { dragAndDrop as runDragAndDrop, type DragOptions } from './interactions.js';
```

Add this method to the `Ext` class (after `acceptDialogs`):

```ts
  /**
   * Robust pointer drag from `source` to `target` that trips activation-distance
   * sensors (dnd-kit, react-dnd, …) where `locator.dragTo()` silently no-ops.
   */
  async dragAndDrop(source: Locator, target: Locator, opts?: DragOptions): Promise<void> {
    await runDragAndDrop(source, target, opts);
  }
```

- [ ] **Step 6: Export the public type and function**

In `src/index.ts`, add at the end:

```ts
export { dragAndDrop } from './interactions.js';
export type { DragOptions } from './interactions.js';
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx playwright test tests/integration/drag-and-drop.spec.ts`
Expected: PASS.

- [ ] **Step 8: Confirm stability under repeats**

Run: `npx playwright test tests/integration/drag-and-drop.spec.ts --repeat-each=5`
Expected: PASS (5/5). If flaky, increase the default `steps` or `nudge` in `src/interactions.ts` — do not weaken the assertion.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/interactions.ts src/ext.ts src/index.ts fixtures/ext/dnd.html fixtures/ext/dnd.js tests/integration/drag-and-drop.spec.ts
git commit -m "feat(ext): add ext.dragAndDrop() for activation-distance DnD (§8)

Raw pointer choreography (nudge past activation + stepped glide) that trips
dnd-kit/react-dnd sensors where locator.dragTo() no-ops.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Documentation sweep (§1, §2, §4, §5, §6, §7, §8, §11, §13, §15)

**Files:**
- Modify: `docs/API.md`
- Modify: `skill/SKILL.md`
- Modify: `README.md`

> Read each file first to match its existing structure and tone. Place each note where it fits; do not restructure unrelated sections. The content to add per item is specified below.

- [ ] **Step 1: `docs/API.md` — document the new API surface**

Add reference entries for:
- `popup.open(popupPath?, opts?)` — the new `opts.viewport`, and the fixture `popupViewport` default; resolution order (per-call overrides fixture default overrides Playwright default).
- `ext.openPage(path, opts?)` — opens any extension page; mirrors `popup.open`; accepts `{ viewport }`.
- `ext.acceptDialogs(page)` — auto-accepts confirm/alert/prompt; returns a disposer.
- `ext.dragAndDrop(source, target, opts?)` — robust pointer DnD; `DragOptions` = `{ steps?, nudge?, settle? }` with defaults 12 / 8 / 4.
- New diagnostic code `loader/duplicate-playwright` in the diagnostics/codes section, with its meaning and fix.

- [ ] **Step 2: `skill/SKILL.md` — add gotchas, the codes-table row, and the shape matrix**

Add to the relevant existing sections:
- **Failure codes table:** a `loader/duplicate-playwright` row — "two @playwright/test copies resolved; consume crxbox as a packed/published tarball or dedupe."
- **Consumption contract (§1):** crxbox must share the consumer's single `@playwright/test`. A live symlink (`portal:`/`link:`) to a dev checkout that ships its own `node_modules` breaks. Supported: publish to a registry, or `npm pack` → `file:` tarball, or dedupe.
- **CommonJS host (§2):** use `.mjs`/`.mts` for `playwright.config` and spec files (or set `"type": "module"`) so crxbox loads as real ESM and avoids an `ERR_REQUIRE_ESM`-class failure. One-line example.
- **Launch config (§4):** `headless`/`--headed`/`PWDEBUG`/`channel`/`slowMo`/`use.launchOptions` are honored; caller `args` are appended to crxbox's required extension args.
- **Popup fidelity (§5):** `open()` is popup-as-page at the default viewport; pass `{ viewport }` or set `popupViewport` for layout-sensitive assertions on small popups.
- **Storage (§6):** state explicitly that `get(key)` returns the *unwrapped value*, not `{ key: value }`. Add a short "seed app state before `popup.open()`" example (e.g. `ext.storage.local.set({...})` then `popup.open()`).
- **Dialogs (§7):** Playwright auto-dismisses unhandled dialogs (so `confirm()` → false, silently aborting); use `ext.acceptDialogs(page)` before clicking destructive actions. Pair this note with the existing async write-through gotcha.
- **Drag-and-drop (§8):** `locator.dragTo()` does a single move and won't trip activation-distance sensors; use `ext.dragAndDrop(source, target)`.
- **Helper / extension-shape matrix (§11):** which helpers apply to which extension shapes — popup-only (`popup.open`, storage, background), content-UI (`contentUi`), full-page/options (`openPage`). Note that `fixtures/ext/` already ships a content script, so `contentUi` has first-party coverage independent of any adopted app.
- **`openPage` (§13):** document the neutral page opener next to `popup.open`.
- **Testability boundaries (§15):** two known limits — (1) "save the current window's tabs" can't be driven faithfully (popup-as-page isn't bound to a real browsing window); (2) load-time data-repair migrations gated behind extension-update flows aren't reachable via storage-seeding + `popup.open()`.

- [ ] **Step 3: `README.md` — requirements/getting-started notes**

Add concise notes (link to API.md/SKILL.md for depth):
- **Consumption (§1):** one `@playwright/test` instance; consume crxbox as a published or packed tarball, not a live dev-checkout symlink.
- **CommonJS hosts (§2):** name your `playwright.config` and specs `.mjs`/`.mts` (or set `"type": "module"`).
- Mention the new helpers (`openPage`, `acceptDialogs`, `dragAndDrop`) and the popup `viewport`/`popupViewport` option in the appropriate feature/overview list.

- [ ] **Step 4: Commit**

```bash
git add docs/API.md skill/SKILL.md README.md
git commit -m "docs: consumption contract, CJS hosts, new helpers, gotchas (§1,2,4-8,11,13,15)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Full verification + build

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS (all Vitest tests).

- [ ] **Step 2: Run the full integration suite**

Run: `npm run test:int`
Expected: PASS (all Playwright specs, including the new viewport / open-page / dialogs / drag-and-drop / launch-options specs).

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all succeed with no errors.

- [ ] **Step 4: Sanity-check the built public API**

Run:
```bash
node --input-type=module -e "import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(', ')))"
```
Expected: output includes `dragAndDrop` alongside the existing exports (`BackgroundHelper, ContentUi, CrxboxError, Ext, PopupHelper, StorageArea, StorageHelper, createExtensionFixtures, expect, test`).

> If everything passes, the branch is ready. Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate (merge / PR / cleanup).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §1 duplicate-playwright → Task 3 (diagnostic) + Task 8 (docs). ✓
- §2 CommonJS host → Task 8 (docs-only, as specified). ✓
- §4 launch options → Task 1 (pure helper + unit) + Task 2 (integration) + Task 8 (docs). ✓
- §5 popup viewport → Task 4 + Task 8. ✓
- §6 storage notes → Task 8 (docs-only). ✓
- §7 dialogs → Task 6 + Task 8. ✓
- §8 drag-and-drop → Task 7 + Task 8. ✓
- §11 helper/shape matrix → Task 8 (docs-only; fixtures/ext already ships a content script). ✓
- §13 openPage → Task 5 + Task 8. ✓
- §15 boundaries → Task 8 (docs-only, per non-goals). ✓
- Positives (§3, §9, §10, §12, §14) → no code; relevant confirmations folded into Task 8 docs. ✓

**Type consistency:** `PopupOpenOptions` (popup.ts), `DragOptions` (interactions.ts), `ExtOptions.popupViewport` / `CrxboxOptions.popupViewport` (both `{ width: number; height: number }`), `ext.openPage`/`acceptDialogs`/`dragAndDrop` signatures, and `findDuplicatePlaywright`/`buildPersistentContextOptions`/`assertSinglePlaywright` names are used identically across tasks and exports. ✓

**Placeholder scan:** every code step contains complete code; docs task enumerates exact content per item rather than "add docs". ✓
