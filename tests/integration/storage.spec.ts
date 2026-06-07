import { test, expect, EXT_PATH } from './_setup';

test.use({ extensionPath: EXT_PATH });

test('set/get round-trips and matcher passes', async ({ ext }) => {
  await ext.storage.local.set({ collections: [{ name: 'a' }] });
  await expect(ext.storage.local).toHaveStorageValue(
    'collections',
    expect.arrayContaining([expect.objectContaining({ name: 'a' })]),
  );
});

test('storage is reset between tests (auto-reset)', async ({ ext }) => {
  const value = await ext.storage.local.get('collections');
  expect(value).toBeUndefined();
});

test('SAVE message writes through the worker', async ({ ext }) => {
  await ext.background.sendMessage({ type: 'SAVE', value: { url: 'https://example.com/' } });
  await expect(ext.storage.local).toHaveStorageValue(
    'saved',
    expect.arrayContaining([expect.objectContaining({ url: 'https://example.com/' })]),
  );
});
