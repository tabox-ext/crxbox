import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

test('windows.create seeds a window with known tabs as Page handles', async ({ ext }) => {
  const handle = await ext.windows.create({
    tabs: [ext.url('options.html'), ext.url('popup.html')],
  });
  expect(typeof handle.id).toBe('number');
  expect(handle.tabs).toHaveLength(2);
  expect(handle.tabs[0]!.url()).toBe(ext.url('options.html'));
  expect(handle.tabs[1]!.url()).toBe(ext.url('popup.html'));

  const inWindow = await ext.tabs.query({ windowId: handle.id });
  const urls = inWindow.map((t) => t.url).sort();
  expect(urls).toContain(ext.url('options.html'));
  expect(urls).toContain(ext.url('popup.html'));
});

test('handle.close() removes the window', async ({ ext }) => {
  const handle = await ext.windows.create({ tabs: [ext.url('options.html')] });
  await handle.close();
  const remaining = await ext.tabs.query({ windowId: handle.id });
  expect(remaining.length).toBe(0);
});

test('windows.create with no tabs opens a window with an empty tabs handle', async ({ ext }) => {
  const handle = await ext.windows.create();
  expect(typeof handle.id).toBe('number');
  expect(handle.tabs).toEqual([]);
  const inWindow = await ext.tabs.query({ windowId: handle.id });
  expect(inWindow.length).toBeGreaterThanOrEqual(1); // the browser's own default tab exists
  await handle.close();
});
