import { test, expect, EXT_PATH } from './_setup.js';

test.describe('per-call viewport', () => {
  test.use({ extensionPath: EXT_PATH });

  test('open({ viewport }) sizes the popup page', async ({ ext }) => {
    const popup = await ext.popup.open(undefined, { viewport: { width: 360, height: 600 } });
    expect(popup.viewportSize()).toEqual({ width: 360, height: 600 });
  });

  test('default open() keeps Playwright default viewport (no breaking change)', async ({ ext }) => {
    const popup = await ext.popup.open();
    expect(popup.viewportSize()).toEqual({ width: 1280, height: 720 });
  });
});

test.describe('fixture popupViewport default', () => {
  test.use({ extensionPath: EXT_PATH, popupViewport: { width: 400, height: 500 } });

  test('open() uses the configured popupViewport when no per-call viewport given', async ({ ext }) => {
    const popup = await ext.popup.open();
    expect(popup.viewportSize()).toEqual({ width: 400, height: 500 });
  });
});
