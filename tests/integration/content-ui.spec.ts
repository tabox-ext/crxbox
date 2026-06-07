import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('reaches injected UI inside an open Shadow root', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');
  const ui = await ext.contentUi(page, { root: '[data-ext-root="shadow"]', shadow: true });
  await expect(ui.getByRole('button', { name: 'Save article' })).toBeVisible();
});

test('reaches injected UI inside an iframe', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');
  const ui = await ext.contentUi(page, {
    root: '[data-ext-root="iframe"]',
    frame: 'iframe[data-ext-frame]',
  });
  await expect(ui.getByRole('button', { name: 'Save from iframe' })).toBeVisible();
});

test('throws a structured diagnostic when the root never injects', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');
  const err = await ext.contentUi(page, { root: '#never-exists', timeout: 1_000 }).catch((e) => e);
  expect(err.name).toBe('CrxboxError');
  expect(err.diagnostic.code).toBe('content-ui/not-injected');
  expect(Array.isArray(err.diagnostic.sawFrames)).toBe(true);
});

test('distinguishes wrong-frame from not-injected when the iframe is absent', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com');
  const err = await ext
    .contentUi(page, { root: '#anything', frame: 'iframe[data-nonexistent-frame]', timeout: 1_000 })
    .catch((e) => e);
  expect(err.name).toBe('CrxboxError');
  expect(err.diagnostic.code).toBe('content-ui/wrong-frame');
  expect(Array.isArray(err.diagnostic.sawFrames)).toBe(true);
});
