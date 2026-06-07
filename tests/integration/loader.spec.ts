import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('resolves a real extension id and builds urls', async ({ ext }) => {
  expect(ext.id).toMatch(/^[a-p]{32}$/);
  expect(ext.url('popup.html')).toBe(`chrome-extension://${ext.id}/popup.html`);
});

test('popup.html renders as a page', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto(ext.url('popup.html'));
  await expect(page.getByRole('button', { name: 'Save tab' })).toBeVisible();
});
