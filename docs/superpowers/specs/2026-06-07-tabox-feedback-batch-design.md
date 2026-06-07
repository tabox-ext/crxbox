# crxbox — Tabox-feedback batch: design

**Date:** 2026-06-07
**Source:** `/Users/gilgo/Projects/tabox/crxbox-feedback.md` (feedback gathered adopting crxbox in the Tabox extension)
**Status:** approved — ready for implementation plan

## Goal

Address every actionable item in the Tabox feedback log: ship the suggested code
fixes and new helper APIs, add regression coverage so they can't silently break,
and do one documentation sweep across `README.md`, `docs/API.md`, and
`skill/SKILL.md`. Positive-only entries (§3, §9, §10, §12, §14) require no code
but feed the docs sweep where they confirm a documented gotcha.

## Scope decisions (confirmed with user)

- **Breadth:** everything — code fixes + new helper APIs + all docs updates.
- **New helpers:** add all three as first-class public API.
- **Popup viewport:** opt-in only; default viewport stays unchanged (no breaking change).
- **Duplicate Playwright:** detection diagnostic *and* docs.
- **Naming:** keep helpers generic (framework is for all extensions, not Tabox):
  `ext.dragAndDrop`, `ext.acceptDialogs`, `ext.openPage`.

## Non-goals

- No change to the ESM-only packaging model (§2 is docs-only guidance for CJS hosts).
- No attempt to make a live dev-checkout symlink "just work" at runtime (§1
  suggestion 3) — covered by the consumption-contract docs + the load-time diagnostic.
- No "attach a real browser window with known tabs" feature for tab-manager
  extensions (§15.1) — documented as a known boundary only.
- No "simulate the extension just updated" hook for migration flows (§15.2) —
  documented as a known boundary only.

---

## Workstreams

Each code workstream ships with its tests and its `docs/API.md` entry. The final
docs sweep (G) consolidates the narrative docs.

### A. Finalize launch-option forwarding + regression guard (§4 🔴)

The forwarding fix already exists uncommitted in `src/loader.ts` and
`src/fixtures.ts` (channel defaults to `'chromium'` and is overridable; user
`args` are appended to crxbox's two required extension args; `headless`,
`channel`, and `launchOptions` are forwarded from Playwright's worker-scoped
fixtures). It is correct but untested. Make it regression-proof:

- **Extract a pure helper** in `loader.ts`, e.g.
  `buildPersistentContextOptions(extPath: string, launchOptions?: LaunchOptions): LaunchOptions`,
  returning the final options object passed to `launchPersistentContext`.
  `launchWithExtension` calls it. Export it for unit testing (internal export is fine).
- **Unit test** (`tests/unit/loader.test.ts` or similar):
  - `channel` defaults to `'chromium'` when not provided, and is overridable.
  - The two extension args (`--disable-extensions-except`, `--load-extension`)
    are always present and point at `extPath`.
  - Caller `args` are **appended**, not replaced.
  - `headless`, `slowMo`, `devtools` pass through unchanged.
- **Integration test** (`tests/integration/`): launch with
  `launchOptions: { args: ['--lang=en-US'] }` and assert the extension still
  loads (service worker resolves, `ext.id` is valid) — proving the extra arg is
  merged, not clobbered.

### B. `loader/duplicate-playwright` diagnostic (§1 🔴)

The raw Playwright "Requiring @playwright/test second time" error is cryptic.
Add a crxbox diagnostic that fires when two distinct `@playwright/test` copies
are resolvable (the `--preserve-symlinks` shadowing case, where crxbox's nested
`node_modules` shadows the consumer's copy).

- **New diagnostic code** `'loader/duplicate-playwright'` in `src/diagnostics.ts`
  with a `HINTS` entry: explain the cause (two `@playwright/test` instances) and
  the one-line fix (consume crxbox as a published/`npm pack`ed tarball, or dedupe
  so there is a single copy — do not live-symlink a dev checkout that has its own
  `node_modules`).
- **Best-effort check** `assertSinglePlaywright()` in `loader.ts`, called at the
  top of `launchWithExtension` (wrapped so a resolution failure never masks the
  real launch):
  - Resolve `@playwright/test` from crxbox's own module via
    `createRequire(import.meta.url).resolve('@playwright/test')`.
  - Resolve it from the consumer via
    `createRequire(path.join(process.cwd(), '__crxbox_probe__.js')).resolve('@playwright/test')`.
  - Compare `fs.realpathSync` of both. If both resolve and the realpaths differ,
    throw `CrxboxError({ code: 'loader/duplicate-playwright', crxboxPath, consumerPath })`.
  - If either resolution throws, skip the check (do not fail the launch).
- **Caveat (documented, not coded):** in the worst case the duplicate triggers
  Playwright's own crash at crxbox import time, before crxbox code runs. The
  consumption-contract docs (workstream G) cover that path; this diagnostic
  catches the cases where crxbox code does run.
- **Unit test**: factor the comparison into a pure function (e.g.
  `findDuplicatePlaywright(crxboxPath, consumerPath)` returning the offending
  pair or `null`) and test: differing paths → returns the pair; identical paths
  → `null`.

### C. Popup viewport opt-in (§5 🟠)

Real Chrome action popups are small and content-sized; `popup.open()` currently
inherits Playwright's 1280×720, which can hide width-sensitive layout bugs.
Add opt-in sizing; keep the default unchanged.

- `popup.open(popupPath?: string, opts?: PopupOpenOptions)` where
  `PopupOpenOptions = { viewport?: { width: number; height: number } }`.
  When `opts.viewport` is provided, call `page.setViewportSize(opts.viewport)`
  after `newPage()` (before or after `goto`, whichever is reliable).
- Add a fixture-level default `popupViewport?: { width; height }` on
  `CrxboxOptions` (marked `{ option: true }`), so a project can pin its popup
  size once in `playwright.config`. Resolution order: per-call `opts.viewport`
  overrides the fixture `popupViewport`, which overrides Playwright's default.
  `PopupHelper` reads the fixture default from `ext` (thread `popupViewport`
  through `Ext` / `ExtOptions`).
- **Integration test**: `popup.open(undefined, { viewport: { width: 360, height: 600 } })`
  → assert `page.viewportSize()` equals `{ 360, 600 }`. A second test sets the
  fixture default and asserts it applies without a per-call arg.

### D. `ext.openPage(path, opts?)` helper (§13 🟢-suggestion)

A neutral opener for non-popup extension pages (options page, full-page view,
sandbox), mirroring `popup.open`.

- `ext.openPage(path: string, opts?: { viewport?: { width; height } }): Promise<Page>`
  → `context.newPage()` → optional `setViewportSize` → `goto(ext.url(path))` →
  return `Page`.
- **Integration test**: open a known fixture page via `ext.openPage(...)` and
  assert it rendered. Reuse `fixtures/ext/popup.html`, or add a minimal
  `page.html` to `fixtures/ext/` if a distinct non-popup page reads clearer.

### E. `ext.acceptDialogs(page)` helper (§7 💡)

Destructive extension flows commonly gate on `window.confirm`; Playwright's
default dismisses unhandled dialogs (so `confirm()` returns `false` and the
action silently aborts).

- `ext.acceptDialogs(page: Page): () => void` — attaches
  `page.on('dialog', d => d.accept())` and returns a disposer that removes the
  listener. Single purpose: accept all dialogs (`confirm`/`alert`/`prompt`).
- **Integration test**: a fixture page whose button handler calls `confirm()`
  and only proceeds on `true`. Without `acceptDialogs` the guarded action does
  not run; with it, the action runs. (Add a small confirm-gated button to
  `fixtures/ext/`.)

### F. `ext.dragAndDrop(source, target, opts?)` helper (§8 💡)

Playwright's `locator.dragTo()` does a single press→move→drop and does not
reliably trip activation-distance pointer sensors (dnd-kit, react-dnd), so the
drag never starts. Provide robust raw-pointer choreography with sane defaults.

- `ext.dragAndDrop(source: Locator, target: Locator, opts?: DragOptions): Promise<void>`
  where `DragOptions = { steps?: number; nudge?: number; settle?: number }`
  (defaults tuned for dnd-kit's distance-5 activation: `nudge: 8`, `steps: 12`,
  `settle: 4`).
- Sequence: derive `page` from `source.page()`; read `boundingBox()` of both;
  move to source center → `mouse.down()` → move by `nudge` px past the center
  (exceed activation distance) → move to target center with `steps` →
  small settle move (`settle` px past center, a few steps) → `mouse.up()`.
- Throw a clear error (reuse an existing diagnostic shape, or a plain
  `CrxboxError`) if either locator has no bounding box (not visible/attached).
- **Integration test**: add a tiny dnd-kit-style sortable list (or a
  `page.setContent` harness with a distance-gated pointer listener) to the
  fixtures so the helper has first-party coverage. Assert order changes where a
  plain `dragTo()` would no-op. Aim for stability under `--repeat-each`.

### G. Documentation sweep (§1, §2, §4, §5, §6, §7, §8, §11, §13, §15)

One coordinated pass over `README.md`, `docs/API.md`, and `skill/SKILL.md`.
Place each note where it fits the existing structure (API reference entries in
`API.md`; gotchas/contract in `SKILL.md`; getting-started/requirements in README):

- **§1 consumption contract** — crxbox must share the consumer's single
  `@playwright/test` instance. Call out that live-symlinking a dev checkout with
  its own `node_modules` breaks; supported options (publish to registry / `npm
  pack` → `file:` tarball / dedupe). Document the new
  `loader/duplicate-playwright` code in the failure-codes table.
- **§2 CommonJS host** — use `.mjs`/`.mts` for `playwright.config` and spec files
  (or set `"type": "module"`) so crxbox loads as real ESM; one-line example.
- **§4 launch config** — `headless`, `--headed`, `PWDEBUG`, `channel`,
  `slowMo`, and `use.launchOptions` are honored; caller `args` are appended to
  crxbox's required extension args.
- **§5 popup fidelity** — `open()` is popup-as-page at the default viewport;
  document the new `viewport` option and fixture `popupViewport` default, and
  advise setting a popup-sized viewport for layout-sensitive assertions.
- **§6 storage notes** — state explicitly that `get(key)` returns the *unwrapped
  value* (not `{ key: value }`); add a short "seed app state before
  `popup.open()`" example.
- **§7 dialog gotcha** — document Playwright's auto-dismiss behavior and the new
  `ext.acceptDialogs(page)` helper (pairs with the async write-through note).
- **§8 drag-and-drop** — document why `dragTo()` no-ops against activation-distance
  sensors and the new `ext.dragAndDrop` helper (with the manual recipe as the
  underlying mechanism).
- **§11 helper / extension-shape matrix** — note which helpers apply to which
  extension shapes (popup-only vs content-UI vs full-page), and that
  `fixtures/ext/` already ships a content script so `contentUi` has first-party
  coverage independent of any adopted app.
- **§13 `openPage`** — document the new neutral page opener alongside `popup.open`.
- **§15 testability boundaries** — document two known limits: (1) "save the
  current window's tabs" can't be driven faithfully (popup-as-page isn't bound
  to a real window); (2) load-time data-repair migrations gated behind
  extension-update flows aren't reachable by storage-seeding + `popup.open()`.

---

## Public API surface review

Additions (no breaking changes):

- `ext.openPage(path, opts?)` — new method.
- `ext.acceptDialogs(page)` — new method, returns a disposer.
- `ext.dragAndDrop(source, target, opts?)` — new method.
- `popup.open(popupPath?, opts?)` — new optional second argument.
- `CrxboxOptions.popupViewport?` — new optional fixture option.
- `'loader/duplicate-playwright'` — new diagnostic code.

All exported types (`PopupOpenOptions`, `DragOptions`) added to `src/index.ts`
where they form part of the public signature.

## Testing strategy

- **Unit (Vitest):** pure helpers — `buildPersistentContextOptions` (A) and the
  duplicate-Playwright path comparison (B). These are the regression guards the
  feedback explicitly asked for in §4.
- **Integration (Playwright against `fixtures/ext/`):** popup viewport (C),
  `openPage` (D), `acceptDialogs` (E), `dragAndDrop` (F), and the args-append
  load check (A). Extend `fixtures/ext/` with a confirm-gated button and a small
  sortable list as needed.
- `npm run typecheck`, `npm run build`, `npm run lint` must pass.

## Build order

A → B → C → D → E → F → G. Each code workstream lands with its tests and
`API.md` entry; G consolidates the narrative docs; then commit.
