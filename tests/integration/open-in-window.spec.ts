import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

// Closes assessment §6.5 #1: "save the current window's tabs" in headless, WITHOUT
// the real toolbar popup. openInWindow puts the popup in the seeded window, so the
// popup's chrome.tabs.query({currentWindow:true}) resolves to that window.
test('openInWindow binds the popup to a seeded window so currentWindow resolves to it', async ({ ext }) => {
  const seeded = [ext.url('options.html'), ext.url('iframe.html')];
  const win = await ext.windows.create({ tabs: seeded });

  const popup = await ext.popup.openInWindow(win);
  await popup.getByRole('button', { name: 'Save window' }).click();

  // The popup's own tab is also in the window, hence arrayContaining (not toEqual).
  await expect(ext.storage.local).toEventuallyHaveStorageValue(
    'savedCurrentWindow',
    expect.arrayContaining(seeded),
  );
});

test('openInWindow accepts a numeric window id', async ({ ext }) => {
  const win = await ext.windows.create({ tabs: [ext.url('options.html')] });
  const popup = await ext.popup.openInWindow(win.id);
  expect(popup.url()).toBe(ext.url('popup.html'));
});
