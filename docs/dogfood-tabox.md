# Dogfooding crxbox against the real Tabox extension

This is the crxbox v1 acceptance milestone (Task 10): prove the core helpers work
against a real, third-party MV3 extension — non-invasively — rather than only the
in-repo test fixture.

## Extension under test

- **Extension:** Tabox — Save and Share Tab Groups (`/Users/gilgo/Projects/tabox`)
- **Build used:** `v4` (chosen over `chrome` and `build` as the most current; all three
  are identical MV3 builds with a `background.service_worker`).
- **`manifest_version`:** `3`
- **`background.service_worker`:** `background.js` (crxbox resolves the extension ID
  from this SW — see `src/loader.ts`).
- **`action.default_popup`:** `index.html` — a React app that mounts into `<div id="root">`.
- The manifest ships a `key`, so Chromium derives a stable extension ID.

No files in the Tabox repo were created, modified, installed, or committed. It was
read-only.

## What crxbox helpers were exercised, and the result

The dogfood spec lives at `tests/dogfood/tabox.spec.ts`. It imports the real public
API from `../../src/index.js` and uses `test.use({ extensionPath: process.env.TABOX_EXT_PATH })`.
All assertions passed against Tabox v4 (4/4):

| # | Helper exercised | Assertion | Result |
|---|------------------|-----------|--------|
| a | Loader / `ext.id` | resolved ID matches `/^[a-p]{32}$/` | PASS |
| b | `ext.background.evaluate` | `typeof chrome.runtime.id === 'string'` and SW `chrome.runtime.id === ext.id` | PASS |
| c | `ext.popup.open('index.html')` | popup document loads, React mounts children into `#root`, `<body>` has non-empty rendered text | PASS |
| d | `ext.storage.local.get()` / `.set()` | returns a plain inspectable object; round-trips a namespaced `__crxbox_dogfood__` key without touching Tabox data | PASS |

### Run output

```
Running 4 tests using 1 worker
  ✓ crxbox loads Tabox and resolves a valid extension id (1.4s)
  ✓ crxbox can reach the Tabox background service worker (637ms)
  ✓ crxbox opens the Tabox popup and it renders real UI (2.6s)
  ✓ crxbox can inspect Tabox storage.local (638ms)
  4 passed (5.5s)
```

The normal integration suite still passes unchanged (13/13) after adding the dogfood
harness.

## Boilerplate crxbox removed vs hand-rolled Playwright

Hand-rolling the same coverage with raw Playwright would require, per spec:

- A persistent-context launch with `--disable-extensions-except` /
  `--load-extension`, `headless: 'new'`/`--headless=new` flags, and a temp user-data
  dir — plus teardown.
- Polling `context.serviceWorkers()` / `waitForEvent('serviceworker')` and parsing the
  `chrome-extension://<id>/` origin out of the SW URL to discover the extension ID.
- Manually constructing `chrome-extension://<id>/...` URLs for every popup/page visit.
- Writing `serviceWorker.evaluate(...)` plumbing for background and `chrome.storage`
  access, including the SW-may-be-asleep wake-up dance.

crxbox collapses all of that into `test.use({ extensionPath })` plus `ext.id`,
`ext.background.evaluate(...)`, `ext.popup.open(...)`, and `ext.storage.local.*`. The
dogfood spec is ~60 lines and contains zero Chromium launch flags, zero ID-parsing, and
zero URL string-building — proving the helpers carry their weight against an extension
crxbox has never seen.

## Friction / gaps discovered (roadmap candidates)

1. **`popup.open()` default path assumes `popup.html`.** Tabox's popup is `index.html`,
   so the caller must pass `ext.popup.open('index.html')`. crxbox could read
   `action.default_popup` from the loaded manifest and default to it, so `popup.open()`
   "just works" for any extension. (Low effort, high ergonomic payoff.)
2. **Running a spec outside the default `testDir` is awkward.** `playwright.config.ts`
   pins `testDir: './tests/integration'`, so `npx playwright test tests/dogfood/...`
   reports "No tests found". Reproducing required a throwaway config that spreads the
   base config and overrides `testDir` (not committed). A documented `projects` entry or
   a dedicated dogfood config would make this first-class.
3. **No deterministic-ID feature yet.** `extensionKey` is accepted but unwired (see
   `CrxboxOptions`); Tabox ships a manifest `key`, which would be a good test case once
   that feature lands.

None of these blocked the milestone — all four core helpers worked against the real
extension on the first green run.

## Reproduce

From the crxbox repo root, with a Tabox MV3 build directory:

```sh
# The dogfood spec is intentionally outside the default testDir, so point a config at it.
# (One-off; do not commit a permanent testDir change.)
cat > playwright.dogfood.tmp.ts <<'EOF'
import base from './playwright.config.ts';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testDir: './tests/dogfood' });
EOF

TABOX_EXT_PATH=/Users/gilgo/Projects/tabox/v4 npx playwright test --config playwright.dogfood.tmp.ts

rm -f playwright.dogfood.tmp.ts
```

The spec self-skips when `TABOX_EXT_PATH` is unset, so it never runs in the normal
suite or CI without an explicit build path.
