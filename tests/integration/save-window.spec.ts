import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

// Proves the window/tabs primitive end-to-end WITHOUT relying on openForTab:
// seed a real window with known tabs → ask the SW to save that window's tabs → assert storage.
test('saving a seeded window persists its tab URLs to storage', async ({ ext }) => {
  const urls = [ext.url('options.html'), ext.url('popup.html')];
  const handle = await ext.windows.create({ tabs: urls });

  await ext.background.sendMessage({ type: 'SAVE_WINDOW', windowId: handle.id });

  await expect(ext.storage.local).toEventuallyHaveStorageValue(
    'savedWindow',
    expect.arrayContaining(urls),
  );
});
