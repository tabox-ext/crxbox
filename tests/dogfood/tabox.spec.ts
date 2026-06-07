import { test, expect } from '../../src/index.js';

// Dogfood: run crxbox's real API against the actual third-party Tabox extension.
//
// This spec lives OUTSIDE the default testDir (./tests/integration), so it is NOT
// part of the normal suite. Run it explicitly with a Tabox build dir:
//
//   TABOX_EXT_PATH=/path/to/tabox/v4 npx playwright test tests/dogfood/tabox.spec.ts
//
// It is skipped when TABOX_EXT_PATH is unset, so it's portable/CI-safe.

const TABOX_EXT_PATH = process.env.TABOX_EXT_PATH;

test.skip(!TABOX_EXT_PATH, 'set TABOX_EXT_PATH to a Tabox build dir');

test.use({ extensionPath: TABOX_EXT_PATH! });

test('crxbox loads Tabox and resolves a valid extension id', async ({ ext }) => {
  // (a) The loader resolved the extension ID from the MV3 service worker.
  expect(ext.id).toMatch(/^[a-p]{32}$/);
});

test('crxbox can reach the Tabox background service worker', async ({ ext }) => {
  // (b) The SW is reachable and evaluate() runs in its context. chrome.runtime.id
  // inside the SW must equal the loader-resolved id.
  const runtimeIdType = await ext.background.evaluate(() => typeof chrome.runtime.id);
  expect(runtimeIdType).toBe('string');

  const runtimeId = await ext.background.evaluate(() => chrome.runtime.id);
  expect(runtimeId).toBe(ext.id);
});

test('crxbox opens the Tabox popup and it renders real UI', async ({ ext }) => {
  // (c) Tabox's action.default_popup is index.html (a React app mounting into #root),
  // not the crxbox default popup.html — so we pass the real path.
  const popup = await ext.popup.open('index.html');

  // The popup document loads and React mounts content into #root. We assert the
  // popup body actually has rendered child content (robust to Tabox internals we
  // haven't pinned: no reliance on specific labels/strings).
  const root = popup.locator('#root');
  await expect(root).toBeAttached();

  // Wait for React to mount: #root gains child element(s).
  await expect
    .poll(async () => root.locator('> *').count(), { timeout: 10_000 })
    .toBeGreaterThan(0);

  // And the visible body has non-empty rendered text/content.
  await expect
    .poll(async () => (await popup.locator('body').innerText()).trim().length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
});

test('crxbox can inspect Tabox storage.local', async ({ ext }) => {
  // (d) storage.local.get() returns an inspectable object. We don't assume any
  // Tabox-specific keys — just that the helper returns a plain object snapshot.
  const all = await ext.storage.local.get();
  expect(typeof all).toBe('object');
  expect(all).not.toBeNull();
  expect(Array.isArray(all)).toBe(false);

  // Round-trip a crxbox-owned key to prove read/write through the live extension's
  // chrome.storage.local (kept under a namespaced key so we never touch Tabox data).
  await ext.storage.local.set({ __crxbox_dogfood__: { ok: true } });
  const readback = (await ext.storage.local.get('__crxbox_dogfood__')) as { ok: boolean };
  expect(readback).toEqual({ ok: true });
});
