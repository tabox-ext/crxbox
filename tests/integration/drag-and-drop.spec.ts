import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

const readOrder = (page: import('@playwright/test').Page) =>
  page.locator('[data-item]').evaluateAll((els) => els.map((el) => el.getAttribute('data-item')));

test('dragAndDrop reorders an activation-distance sortable list', async ({ ext }) => {
  const page = await ext.openPage('dnd.html');
  expect(await readOrder(page)).toEqual(['a', 'b', 'c']);

  await ext.dragAndDrop(page.locator('[data-item="a"]'), page.locator('[data-item="c"]'));

  // A was dropped after C → B, C, A
  expect(await readOrder(page)).toEqual(['b', 'c', 'a']);
});
