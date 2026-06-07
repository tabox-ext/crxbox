import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('openPage() opens a non-popup extension page and returns the Page', async ({ ext }) => {
  const page = await ext.openPage('options.html');
  await expect(page.locator('#title')).toHaveText('Options Page');
});

test('openPage() applies an optional viewport', async ({ ext }) => {
  const page = await ext.openPage('options.html', { viewport: { width: 500, height: 400 } });
  expect(page.viewportSize()).toEqual({ width: 500, height: 400 });
});
