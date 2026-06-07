# crxbox — Design Spec

**Date:** 2026-06-07
**Status:** Approved (pending final spec review)
**Source research:** [`crxbox-framework-research.md`](../../../crxbox-framework-research.md)

A lightweight, TypeScript-first toolkit for testing Chrome extensions. It is an
**extension-aware layer on top of Playwright** — not a new automation engine.
Positioning: *"Playwright, but extension-aware."*

---

## 1. Goals & principles

Three core principles govern every decision in this spec:

1. **Simple & lightweight.** Smallest possible install footprint and API surface.
2. **An answer to testing complex UIs.** Content-script UI (injection readiness,
   Shadow DOM, iframe, SPA survival) is the flagship capability.
3. **AI-agent-friendly.** Easy for coding agents to use and token-efficient.

### What "lightweight" means here
crxbox is a **devDependency** — it never ships into the user's extension or into
the browser, so there is no in-browser runtime bundle to shrink. The metrics that
actually matter are:
- **Install footprint** — crxbox has **zero runtime dependencies**.
- **API surface area** — fewer concepts to learn = fewer tokens for an agent.

Both are enforced in CI (see §8).

---

## 2. Key decisions (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary consumer of v1 | **Tabox-first, then OSS** | Validate against a real codebase; keep scope honest; open-source once earned. |
| Agent-friendliness scope | Bundled skill/docs + terse predictable API + machine-readable failures. **No MCP in v1.** | Cheap, high-leverage, stays lightweight. MCP is a possible later add-on. |
| MVP scope | **Lean core — 5 of 7** research features | Drops the fragile message spy, trace viewer, side panel from v1. |
| Packaging | **Single unscoped package `crxbox`**, zero runtime deps, `@playwright/test` as peer dep | Smallest footprint, one import, internally modular so we can split later. |
| Canonical entry point | **Both** entry styles; **pre-wired `import { test, expect } from 'crxbox'` is the documented default** | One-import default is most token-efficient/least error-prone for agents; composable form preserves zero lock-in (§5.1 of research). |

### Explicitly out of scope for v1
- **Message spy** (research §5.6 — most fragile; survives-SW-restart monkey-patching).
- **Trace viewer**, **side-panel support**, **extension-aware recorder**.
- Any custom test runner, cross-browser support, NL test generation, fluent flow DSL.

These remain on the roadmap (§9) but are not built in v1.

---

## 3. Architecture & package layout

Single package, **ESM-only** output (Node 18+), full TypeScript types. *(As-built: ESM-only was chosen over dual ESM+CJS to avoid the dual-`.d.ts` "are-the-types-wrong" hazard and keep the package lean; Playwright transpiles test files, so this is transparent to test authors.)*

```
src/
  index.ts            # exports: test, expect, createExtensionFixtures, types
  fixtures.ts         # builds the `ext` fixture + pre-wired test/expect
  ext.ts              # the Ext facade (ties helpers to context + id)
  loader.ts           # load unpacked, resolve build dir, resolve extension ID
  helpers/
    popup.ts          # ext.popup
    content-ui.ts     # ext.contentUi   (flagship)
    background.ts     # ext.background
    storage.ts        # ext.storage
  matchers.ts         # toHaveStorageValue (+ future matchers)
  diagnostics.ts      # CrxboxError + structured failure codes
  skill/
    SKILL.md          # bundled in the published package
fixtures/
  ext/                # minimal MV3 extension used to test crxbox itself
```

Each helper is a focused module behind the `ext` facade — independently testable,
and splittable into a separate package later (MCP, trace-viewer) without changing
the facade.

### Dependency policy
- Runtime dependencies: **none**.
- Peer dependency: `@playwright/test` (the user already has it).
- The published package includes the compiled output **and** `skill/SKILL.md`.

---

## 4. API surface

### Configuration
A single fixture option, settable via `test.use({...})` or a Playwright project's
`use` block:

```ts
test.use({
  extensionPath: './dist',   // required: the built, unpacked extension
  extensionKey:  '...',      // optional: deterministic ID for origin allow-listing
});
```

The composable form takes the same object:

```ts
import { createExtensionFixtures } from 'crxbox';
import { test as base } from '@playwright/test';
const test = base.extend(createExtensionFixtures({ path: './dist' }));
```

### Canonical example (the snippet docs/agents copy)

```ts
import { test, expect } from 'crxbox';

test.use({ extensionPath: './dist' });

test('save current tab from popup', async ({ ext, page }) => {
  await page.goto('https://example.com');
  const popup = await ext.popup.open();
  await popup.getByRole('button', { name: 'Save tab' }).click();
  await expect(ext.storage.local).toHaveStorageValue('collections',
    expect.arrayContaining([
      expect.objectContaining({
        tabs: expect.arrayContaining([
          expect.objectContaining({ url: 'https://example.com/' }),
        ]),
      }),
    ]),
  );
});
```

### The `ext` facade — 5 helpers

| Helper | API | Notes |
|--------|-----|-------|
| **Loader / ID** | `ext.id` · `ext.url('popup.html')` | ID resolved off the SW URL by default; deterministic `extensionKey` supported for origin allow-listing (§8.4 of research). |
| **Popup** (honest two modes, research §5.2) | `ext.popup.open()` → `Page` · `ext.popup.openForTab(page)` | `open()` = popup-as-page for logic/UI (~90% of assertions). `openForTab()` = verify the popup opens against the right active tab. No magic single abstraction. |
| **Content-UI** (flagship, research §5.4) | `ext.contentUi(page, { root, shadow?, frame? })` → `ContentUi` with `.locator()`, `.getByRole()`, `.waitForReady()` | Auto-waits for injection; resolves Shadow-DOM roots and iframe frames; answers "injected? right frame? survived navigation?" |
| **Background / SW** | `ext.background.evaluate(fn)` · `.sendMessage(msg)` · `.kill()` · `.waitForReady()` | `kill()` is CDP-forced termination (research §5.3) — the differentiator: assert state survives a forced restart, not just natural suspend. *(As-built: `.logs()` deferred — SW console capture is fiddly; see §9.)* |
| **Storage** | `ext.storage.local` / `.sync` / `.session`, each: `.get(key)` · `.set(value)` · `.clear()`; auto-reset between tests | Plus matcher `expect(ext.storage.local).toHaveStorageValue(key, expected)`. |

### Two cross-cutting rules (both serve principle #3)
1. **Everything auto-waits** like a Playwright locator. No `waitForTimeout`, no
   manual sleeps, no timing parameters to guess.
2. **Every wait throws a structured `CrxboxError`** (see §5).

### Naming conventions (terse, predictable — enforced in review)
- Consistent verbs: `open` / `evaluate` / `sendMessage` / `kill` / `get` / `set` / `clear`.
- One obvious way per task; no aliases, no overloaded magic.
- Strong discriminated-union types so an agent's first guess type-checks.

---

## 5. Machine-readable failures

Every crxbox wait that fails throws a `CrxboxError` carrying a structured
`diagnostic`. Printed format:

```
content-ui readiness timeout
  crxbox: {"code":"content-ui/not-injected","root":"[data-ext-root]",
           "expectedFrame":"main","sawFrames":["main","about:blank"],"waitedMs":5000}
  hint: the root selector never appeared in the main frame — check the content
        script's matches/run_at, or pass { frame } if it injects into an iframe.
```

- **Human line** + a **single-line JSON `crxbox:` block** (parse-friendly) + a `hint:`.
- Error `code`s are **stable** and namespaced `helper/condition`.
- All codes are documented in the bundled skill's failure-code table.

### Initial code catalog (v1)
| Code | Meaning |
|------|---------|
| `loader/build-not-found` | `extensionPath` missing or no `manifest.json`. |
| `loader/sw-timeout` | Service worker never registered after load. |
| `popup/no-active-tab` | `openForTab()` called without an active tab. |
| `content-ui/not-injected` | Root selector never appeared (includes `sawFrames`). |
| `content-ui/wrong-frame` | Root found, but in an unexpected frame. |
| `background/restart-timeout` | SW did not come back after `kill()`. |
| `background/eval-failed` | `evaluate()` threw inside the SW. |
| `storage/key-absent` | `toHaveStorageValue` matcher: key not present. |

---

## 6. Agent-friendliness deliverables

### 6.1 Bundled `SKILL.md`
Ships inside the package (`crxbox/skill/SKILL.md`). One file an agent reads to
become productive — no source scanning. Token-efficient structure:
- Frontmatter `name` + `description` with trigger conditions.
- **Setup** — install + the one-line `extensionPath` config.
- **The 5 helpers** — each: one-line purpose + the single minimal snippet.
- **Failure-code table** — every code → meaning → fix.
- **Canonical patterns** — SW-restart resilience, content-UI in Shadow DOM, storage assertion.
- **Anti-patterns** — "never `waitForTimeout`"; "use `openForTab` not raw `popup.html` when verifying active-tab wiring".

A short pointer in `README.md` / `AGENTS.md` helps agents discover the skill.
This same file becomes the OSS docs spine later (write once).

### 6.2 Terse predictable API
Enforced via the naming conventions in §4 and small `.d.ts` per helper.

### 6.3 Machine-readable failures
The `CrxboxError` / diagnostic format in §5.

---

## 7. Testing strategy for crxbox itself

### Fixture extension (`fixtures/ext/`)
A minimal MV3 extension used as the system-under-test:
- A popup (`popup.html`) with a known button.
- A content script that injects UI in **two variants**: Shadow-DOM root and iframe.
- A background service worker with a `PING/PONG` handler and a storage-writing handler.
- `chrome.storage` usage (local/sync/session).

Every helper is exercised against this fixture. It also seeds the research's
"built-in host-page fixtures" idea for later.

### Test layers
- **Unit** (fast, no browser): ID parsing, diagnostic formatting, matcher comparison.
- **Integration** (real Playwright + bundled Chromium against the fixture extension):
  - popup renders (`open`) and opens for the right tab (`openForTab`);
  - content-UI readiness across Shadow DOM and iframe;
  - `background.kill()` → state survives restart;
  - storage reset between tests.

### CI
- Integration on Linux Chromium **headless** (the `chromium` channel supports
  extensions headless, research §8.4).
- **Dependency/size budget gate**: fail the build if runtime deps > 0 or package
  size regresses beyond a set threshold.
- Typecheck + lint.

---

## 8. v1 acceptance criteria (definition of done)

1. `import { test, expect } from 'crxbox'` works with one `extensionPath` config.
2. All 5 helpers pass integration tests against the fixture extension.
3. `background.kill()` demonstrably forces SW termination and state survives.
4. Content-UI helper resolves Shadow-DOM and iframe roots with readiness waiting.
5. Every helper failure produces a structured `CrxboxError` with a catalogued code.
6. Package publishes with **zero runtime dependencies** and the bundled `SKILL.md`.
7. **Dogfood milestone:** a representative slice of Tabox's existing tests is ported
   onto crxbox, showing reduced custom test infrastructure.

---

## 9. Roadmap beyond v1 (not built now)

In rough priority order, from the research:
1. **Message spy** — trace runtime/tabs messaging across content/background/popup
   (research §5.6 — expect fragility; must survive SW restart).
2. **Extension-aware trace viewer** — cross-context story
   (page click → content-script event → runtime message → SW handler → storage write → popup update).
3. **Built-in host-page fixtures** — blank, SPA, iframe-heavy, Shadow-DOM, etc.
4. **Side-panel support** (even partial) — a genuine Playwright gap
   (microsoft/playwright issue #26693).
5. **Live MCP server** — expose crxbox capabilities as agent-callable tools.
6. **Extension-aware recorder.**

**As-built follow-ups surfaced during v1 implementation / dogfooding:**
7. **`popup.open()` should default to the manifest's `action.default_popup`** instead of hardcoding `popup.html` (the Tabox dogfood needed an explicit `index.html`). The override param exists; just resolve the default from the manifest.
8. **`ext.background.logs()`** — capture SW console logs/errors (deferred from §4).
9. **Retrying `toHaveStorageValue`** — a polling variant so async/fire-and-forget writes don't need `expect.poll` (the matcher does a single read today; SKILL documents the workaround).
10. **More pure-unit coverage** — ID parsing and matcher comparison are currently covered only at the integration layer.

---

## 10. Suggested build order (for the implementation plan)

1. Repo scaffold: package, TS build (ESM-only), lint, CI skeleton, size-budget gate.
2. Fixture extension (`fixtures/ext/`) — the system-under-test.
3. Loader + ID + `ext.url()` + pre-wired `test`/`expect` and `createExtensionFixtures`.
4. Storage helper + `toHaveStorageValue` matcher + auto-reset.
5. Popup helper (`open`, `openForTab`).
6. Content-UI helper (flagship): injection readiness, Shadow DOM, iframe.
7. Background helper: `evaluate`, `sendMessage`, `waitForReady`, `kill` (CDP).
8. Diagnostics: `CrxboxError` + full code catalog wired into every helper.
9. Bundled `SKILL.md` + README/AGENTS pointer.
10. Dogfood: port a Tabox test slice.
