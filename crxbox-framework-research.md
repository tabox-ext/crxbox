# crxbox — Chrome Extension Testing Framework

**Research summary & getting-started guide**

*A lightweight, TypeScript-first test toolkit for Chrome extensions, built on Playwright, with first-class APIs for the surfaces Playwright doesn't understand: popups, content-script UI, the background/service worker, storage, permissions, and runtime messages.*

---

## 1. The thesis

Do **not** build a new browser-automation engine. Build an **extension-aware layer on top of Playwright/CDP** that solves the pain points generic E2E tools leave to you.

The one-line positioning:

> **"Playwright, but extension-aware."**

Compete on extension knowledge, not on browser automation. Playwright already wins the automation layer; the gap is everything specific to how extensions actually work (multi-surface flows, injection timing, MV3 lifecycle, the popup, the side panel).

---

## 2. Landscape — why Playwright is the right base

| Tool | Good for | Main drawbacks | Where crxbox improves |
|------|----------|----------------|------------------------|
| **Playwright** | Best current base for extension E2E. Loads unpacked extensions via persistent context, retrieves the extension ID, accesses MV3 service workers, opens extension pages. | Not extension-native. You hand-roll fixtures, extension-ID retrieval, popup URLs, SW lifecycle, content-script timing, multi-surface flows. Extensions only work in **Chromium with a persistent context**. | Ship `popup()`, `newTab()`, `optionsPage()`, `contentUi()`, `background()`, `storage()`, `permissions()`, `messages()` as first-class helpers. |
| **Puppeteer** | Strong CDP control. Docs show loading extensions, accessing MV3 workers, opening a popup via `chrome.action.openPopup()`. | Lower-level as a test framework: more manual target/page handling, weaker assertions, fixtures, parallelization, traces, retries. | Borrow Puppeteer/CDP techniques under the hood only where Playwright lacks extension access (e.g. forced SW termination). |
| **WebdriverIO / Selenium** | Broad WebDriver ecosystem; WebdriverIO has official Web Extension Testing docs. | Heavier setup, less ergonomic; Chrome/Firefox load flows differ; Safari support lags. | Position as faster, TypeScript-first, extension-specific, CI-friendly. |
| **Cypress** | Great DX for normal web apps. | Poor fit for real extension E2E; can't control more than one browser context without extra Puppeteer glue; popup/content-script testing becomes workaround-heavy. | Handle real extension surfaces instead of treating them like ordinary pages. |
| **WXT / Plasmo / CRXJS / Extension.js** | Great for *building* extensions. WXT gives first-class Vitest + in-memory fake-browser unit tests. | They're build frameworks, not UI-flow E2E frameworks. WXT's own guidance points to Playwright for E2E. | Auto-detect and integrate with their build output instead of competing. |
| **Vitest / Jest + mocks** | Very fast unit tests of pure logic. | Not a real browser runtime; can't prove popup behavior, active-tab behavior, permissions, real injection, storage lifecycle, or SW restart behavior. | Offer a middle layer: fast runtime tests against real extension pages in Chromium with quick state reset. |
| **Recorder tools** | Bootstrapping flows. | Page-centric; weak on popup/background/content-script messaging; brittle output. | Build an extension-aware recorder *later*: record popup + page + background messages as one flow. |

---

## 3. Verified technical facts (checked against current sources)

These shape the design and are confirmed as of mid-2026:

- **Side-loading flags are gone.** Chrome and Edge removed the command-line flags needed to side-load extensions, so you must use the **Chromium that ships with Playwright**. Extensions only work in a **persistent context**. (Playwright docs: https://playwright.dev/docs/chrome-extensions)
- **MV3 service workers suspend after ~30s idle** and restart on demand. Playwright now **keeps the same `Worker` object alive** across restart — no new `serviceworker` event fires — and **stalls `evaluate()` calls** during the restart window, resuming automatically. *Implication:* the natural suspend/restart is increasingly handled for you; the valuable thing to test is **deliberate, forced** termination (see §5.3).
- **Side panel is a genuine gap.** Playwright has no straightforward way to open the side panel and get its `Page` object. The feature request (microsoft/playwright **issue #26693**) is open: https://github.com/microsoft/playwright/issues/26693. You cannot reliably open the side panel programmatically — `sidePanel.open()` requires a user gesture — which is exactly why this is hard and why even partial support is a differentiator.
- **Popup opening** can be driven from the service worker via `chrome.action.openPopup()` (Puppeteer's docs demonstrate this), but it has gesture/context constraints and is not a perfect stand-in for the real toolbar flow (see §5.1).

**Prior art worth studying before you build:**
- **`ruifigueira/playwright-crx`** — Playwright running *inside* a Chrome extension. Different goal, but it has already solved a lot of the CDP/extension-context plumbing you'll hit. https://github.com/ruifigueira/playwright-crx
- **Dramaturg** — a Playwright REPL/debugger living in a Chrome side panel (CDP-based). Useful reference for side-panel + CDP techniques.

---

## 4. The five unsolved problems crxbox targets

1. **Popup testing is awkward.** A popup is not just another page — it depends on the active tab, action state, lifecycle, and focus, and may close on blur. Opening `chrome-extension://<id>/popup.html` works for logic but isn't the real toolbar flow.
2. **Content-script UI needs a dedicated abstraction.** Injected UI may live in page DOM, Shadow DOM, an iframe, an isolated world, a dynamically injected root, or survive (or not) SPA navigation. The hard part is knowing *when* the script injected, *whether* it attached to the right frame, *whether* it survived navigation, and *whether* it can still reach the background.
3. **MV3 service-worker lifecycle causes real bugs.** Workers terminate when idle, lose global state, must register listeners early, and can interrupt timers. Extensions must keep working after the worker is killed and restarted.
4. **Extension ID, permissions, and build output are boilerplate.** A deterministic ID is often needed (origin allow-listing, opening extension pages). Today you write glue to fish the ID out of the SW URL.
5. **Multi-context flows are painful to orchestrate.** A single real flow crosses page → content script → popup → background → tabs query → storage write → new tab/options page. Playwright *can* do it, but you wire up every piece yourself.

---

## 5. Design refinements (opinionated guidance)

These are deliberate course-corrections from the raw research:

### 5.1 Ship a **library of fixtures**, not a framework that owns the runner
The market for serious extension E2E is thin, and most teams that test extensions already have a ~150-line Playwright fixtures file they tolerate. A wrapper that re-exports its own `test`/`expect` is a high adoption bar. **Lower the friction: bring-your-own-Playwright, drop in `crxbox` fixtures and helpers.** Same ergonomic APIs (`ext.popup`, `ext.contentUi`, `ext.background`), zero lock-in. This single decision is the biggest lever on adoption.

### 5.2 Be honest that the "real popup" is two different things
You cannot fully drive the *real* toolbar popup while also clicking elsewhere — automation can steal focus and the popup closes on blur, and `chrome.action.openPopup()` has gesture/context limits. So offer two clearly-labeled capabilities:
- **(a) popup-as-page** — test `popup.html` for logic/UI. Covers ~90% of assertions.
- **(b) open-for-correct-tab wiring** — verify the popup opens against the right active tab.

Don't imply a magic single abstraction.

### 5.3 Reframe the service-worker story around **forced termination**
Since Playwright now gracefully handles natural suspend/restart, the differentiator isn't "we handle SW lifecycle" — it's **"we let you deliberately kill the worker (via CDP) and assert state survives,"** catching the bugs the graceful handling otherwise hides.

### 5.4 Lead with **content-script readiness** as the flagship
"Is it injected, did it attach to the right frame, did it survive SPA navigation, can it still message the background" causes more flaky tests than anything else. Make this the headline capability, and build the trace viewer around the cross-context story.

### 5.5 Cut these from any near-term plan
- **Fluent flow DSL** (`ext.flow(...).onPage(...).openPopup().click(...)`) — a maintenance trap that reads worse than just writing the steps and competes with Playwright's own readable API.
- **Natural-language test generation** — demos well, rots fast, produces brittle tests.

### 5.6 Treat the **message spy** as harder than it looks
Tracing `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` means injecting instrumentation into every world (content-script isolated world, background, popup) and **surviving SW restarts that wipe your monkey-patch**. It's the most fragile MVP item — budget for it.

---

## 6. Feature roadmap

### MVP
1. **Extension loader** — load unpacked; auto-detect build output (WXT, Plasmo, CRXJS, Vite, custom `dist`); get extension ID; `ext.url('popup.html')`.
2. **Popup helper** — `ext.popup.open()`, `ext.popup.openForTab(page)`, `ext.popup.page()`; handle active-tab/focus issues; be explicit about the two modes (§5.2).
3. **Content-UI helper** — wait for injection; Shadow-DOM roots; iframe-based UI; `contentUi.locator(...)`. *(Flagship — §5.4.)*
4. **Background / service-worker helper** — evaluate in the SW; send runtime messages; **kill/restart** (CDP-forced); collect logs/errors.
5. **Storage helper** — clear between tests; inspect `chrome.storage` local/sync/session; `toHaveStorageValue` matcher.
6. **Message spy** — trace runtime/tabs messaging across content/background/popup. *(Hardest — §5.6.)*
7. **Fast test-profile reuse** — keep a Chromium context warm per worker; reset extension state between tests; avoid full relaunch.

### Later differentiators
- **Extension-aware trace viewer** — `page click → content-script event → runtime message → SW handler → storage write → popup update`. Much better than generic Playwright traces for extension debugging.
- **Built-in host-page fixtures** — blank, SPA-navigation, iframe-heavy, Shadow-DOM, Gmail-like, YouTube-like, restricted `chrome://` page, login-required mock.
- **Side-panel support** (even partial, via CDP/workarounds) — a real gap and a strong selling point (§3, issue #26693).
- **Extension-aware recorder** — record popup + page + background messages as one flow.

### Explicitly avoid
A full new runner; a Selenium replacement; visual testing as the core feature; cross-browser before Chrome is excellent; a generic web E2E DSL. Those are crowded; the gap is **extension-native orchestration**.

---

## 7. API direction

```ts
import { test, expect } from '@crxbox/playwright'; // or: drop-in fixtures over your own PW (preferred, §5.1)

test('save current tab from popup', async ({ ext, page }) => {
  await page.goto('https://example.com');
  const popup = await ext.popup.open({ activeTab: page });
  await popup.getByRole('button', { name: 'Save tab' }).click();
  await expect(ext.storage.local()).toHaveValue({
    collections: expect.arrayContaining([
      expect.objectContaining({
        tabs: expect.arrayContaining([
          expect.objectContaining({ url: 'https://example.com/' }),
        ]),
      }),
    ]),
  });
});

test('save from injected button', async ({ ext, page }) => {
  await page.goto('/fixtures/article.html');
  const ui = await ext.contentUi(page, { root: '[data-extension-root]', shadow: true });
  await ui.getByRole('button', { name: 'Save article' }).click();
  await expect(ext.messages()).toHaveSent({ type: 'SAVE_ARTICLE' });
});

test('works after service worker restart', async ({ ext, page }) => {
  await page.goto('https://example.com');
  await ext.background.kill();                 // forced via CDP (§5.3)
  const popup = await ext.popup.open({ activeTab: page });
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(ext.storage.local('collections')).not.toBeEmpty();
});
```

---

## 8. Getting started

### 8.1 Prerequisites & constraints
- **Chromium only**, launched with a **persistent context**. Use Playwright's bundled Chromium (the `chromium` channel) — side-loading flags were removed from Chrome/Edge.
- Node 18+ and TypeScript.
- An unpacked extension build (a `dist/` with `manifest.json`).

### 8.2 Install
```bash
npm i -D @playwright/test && npx playwright install chromium
```

### 8.3 Minimal working foundation (plain Playwright)
This is the boilerplate crxbox will wrap. Use it as the starting harness today.

```ts
// fixtures.ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

const EXT_PATH = path.resolve(__dirname, '../dist'); // your built extension

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // MV3: read the ID off the service worker URL
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2]; // chrome-extension://<id>/...
    await use(id);
  },
});

export const expect = test.expect;
```

```ts
// popup.spec.ts
import { test, expect } from './fixtures';

test('popup renders', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('button', { name: 'Save tab' })).toBeVisible();
});
```

```ts
// background.spec.ts — evaluate inside the service worker
import { test, expect } from './fixtures';

test('background responds to message', async ({ context }) => {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const result = await sw.evaluate(async () => {
    return await chrome.runtime.sendMessage({ type: 'PING' });
  });
  expect(result).toEqual({ type: 'PONG' });
});
```

### 8.4 Notes that bite you early
- **Headless:** the `chromium` channel supports extensions in headless mode; otherwise launch headed.
- **SW suspension:** if a test idles >~30s, the worker suspends. Playwright keeps the `Worker` object and stalls `evaluate()` until restart — so you usually don't need to re-fetch it, but don't cache assumptions about global SW state across that boundary.
- **Forced termination** (for resilience tests) needs CDP (`context.newCDPSession(...)` against the worker target) rather than a built-in Playwright call — this is exactly the gap crxbox's `ext.background.kill()` should fill.
- **Deterministic extension ID:** set a fixed `key` in `manifest.json` (or pack once and reuse) when you need a stable ID for origin allow-listing.

### 8.5 Suggested build order
1. Stand up the foundation above and get one popup + one background test green in CI.
2. Wrap it into `crxbox` fixtures (loader + ID + storage reset).
3. Add the **content-UI** helper (Shadow DOM / iframe / injection-readiness) — your flagship.
4. Add **forced SW kill/restart** via CDP.
5. Add the **message spy** (expect fragility; test it against SW restart).
6. Layer the **trace viewer**, host-page fixtures, and **side-panel** experiment.

---

## 9. Naming

**Chosen name: `crxbox`** — `crx` is the universally recognized shorthand for a Chrome extension; `box` ties to the Tabox lineage. Reads cleanly as a package: `import { test } from 'crxbox'`.

### Availability (checked)
| Namespace | Status |
|-----------|--------|
| npm (`crxbox`, unscoped) | **Free** |
| npm scope (`@crxbox`) | **Free** (0 packages) |
| npm — any package containing "crxbox" | **None** |
| PyPI | **Free** |
| crates.io | **Free** |
| GitHub repos matching "crxbox" | **None** |
| GitHub org/user handle `crxbox` | Unconfirmed (API rate-limited); no repos exist under it |
| **`crxbox.com` domain** | **TAKEN** — a ~9-month-old site serving CRX-download/parked pages (`ww1.crxbox.com` subdomain). Adjacent to the extension space, so mildly confusable. |
| `crxbox.dev` / `.io` / `.ai` | Not yet checked — verify at a registrar; **`.dev` is the natural home for a dev tool.** |

**Trademark / collisions:** low risk in software. "CRX" is busy in the wider world (Honda CR-X, a band, a human gene) but none are dev tooling and none own "crxbox."

**Bottom line:** clean everywhere that matters for an open-source dev tool (npm, GitHub, PyPI, crates). The only compromise is the `.com`. If `.dev` is acceptable, `crxbox` is a solid, available pick.

**Runners-up considered:** `extbox` (npm free; only a dead 0★ GitHub repo) and `boxwright` (npm free; on-theme "box + Playwright"). Avoid `boxkit` (64 GitHub repos incl. a 248★ project). `testbox`, `checkbox`, `popbox`, `playbox`, `boxer` are all taken on npm.

---

## 10. Bottom line

There is room for this. The strongest angle is **not** "faster Playwright" — it's **extension-aware Playwright**. The most valuable wins, in order:

1. No-boilerplate extension loading + deterministic ID.
2. First-class **content-script UI** testing (injection readiness, Shadow DOM, iframe, SPA survival).
3. Reliable popup handling (honest about the two modes).
4. Background-worker / message / storage helpers.
5. **Forced** MV3 service-worker restart tests.
6. Cross-context trace viewer (popup ↔ page ↔ content script ↔ SW).
7. A simple TypeScript API that feels made for extension developers — shipped as **drop-in fixtures, not a runner**.

For Tabox-style flows (saving tabs, reopening collections, injected UI, new-tab/extension-page behavior) this removes a lot of custom test infrastructure — and is reusable by other extension builders.
