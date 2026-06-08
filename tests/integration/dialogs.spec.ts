import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('without acceptDialogs, Playwright auto-dismisses confirm() (action cancelled)', async ({ ext }) => {
  const page = await ext.openPage('confirm.html');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#status')).toHaveText('cancelled');
});

test('acceptDialogs(page) makes confirm() return true so the action proceeds', async ({ ext }) => {
  const page = await ext.openPage('confirm.html');
  ext.acceptDialogs(page);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#status')).toHaveText('deleted');
});

test('the returned disposer detaches the handler', async ({ ext }) => {
  const page = await ext.openPage('confirm.html');
  const stop = ext.acceptDialogs(page);
  stop();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#status')).toHaveText('cancelled');
});
