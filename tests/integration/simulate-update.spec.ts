import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('simulateUpdate fires onInstalled with reason "update" and previousVersion', async ({ ext }) => {
  await ext.simulateUpdate({ previousVersion: '1.0.0' });
  await expect(ext.storage.local).toEventuallyHaveStorageValue('onInstalled', {
    reason: 'update',
    previousVersion: '1.0.0',
  });
});

test('simulateUpdate defaults reason to "update"', async ({ ext }) => {
  await ext.simulateUpdate();
  await expect(ext.storage.local).toEventuallyHaveStorageValue('onInstalled', {
    reason: 'update',
    previousVersion: null,
  });
});
