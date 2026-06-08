# Changelog

All notable changes to crxbox are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-08

### Added
- `ext.windows.create()` and `ext.tabs` (create/query/close) — seed a real browser window with
  known tabs and drive active-tab / "save current window" flows.
- Storage matchers: `toEventuallyHaveStorageValue` (polling) and `toHaveStorageKeys` (subset).
- `ext.simulateUpdate()` (experimental) — fire `chrome.runtime.onInstalled` to exercise migration logic.
- `ext.openPage()`, `ext.acceptDialogs()`, `ext.dragAndDrop()`.
- Opt-in popup viewport: `popup.open(path, { viewport })` + fixture `popupViewport`.
- Launch-config forwarding: `headless`/`--headed`/`PWDEBUG`/`channel`/`slowMo`/`use.launchOptions`.
- Diagnostics: `loader/duplicate-playwright`, `drag/no-bounding-box`, `drag/cross-page`,
  `window/create-failed`, `tabs/not-found`, `simulate-update/unavailable`.
- `docs/fixture-extension.md` — first-party example-extension reference; README debugging recipe.

### Changed
- `popup.open()` / `openForTab()` default to the manifest's `action.default_popup`.
- `openForTab` is marked `@experimental` and retries the focus/openPopup sequence once.

### Notes
- Pre-1.0: the API may still change. Consume as a published or `npm pack`ed tarball sharing the
  consumer's single `@playwright/test` instance (not a live dev-checkout symlink).
