import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('tabs.create opens an extension page and returns a Page', async ({ ext }) => {
  const page = await ext.tabs.create(ext.url('options.html'));
  await expect(page.locator('#title')).toHaveText('Options Page');
});

test('tabs.create accepts a bare extension path', async ({ ext }) => {
  const page = await ext.tabs.create('options.html');
  expect(page.url()).toBe(ext.url('options.html'));
});

test('tabs.query returns descriptors and tabs.close removes a tab', async ({ ext }) => {
  const page = await ext.tabs.create('options.html');
  const before = await ext.tabs.query({ url: ext.url('options.html') });
  expect(before.length).toBeGreaterThanOrEqual(1);
  expect(before[0]!.url).toBe(ext.url('options.html'));

  await ext.tabs.close(page);
  const after = await ext.tabs.query({ url: ext.url('options.html') });
  expect(after.length).toBe(before.length - 1);
});
