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
