import { test, expect, EXT_PATH } from './_setup';

test.use({ extensionPath: EXT_PATH });

test('open() renders popup.html and Save writes through to storage', async ({ ext, context }) => {
  // A separate tab exists, but note: open() loads popup.html in its OWN new tab, which
  // becomes the active tab. So popup.js's chrome.tabs.query({active,currentWindow}) sees the
  // popup page itself (a chrome-extension:// url), NOT example.com. That's the inherent
  // popup-as-page limitation — open() is for popup logic/UI assertions. Deterministic
  // active-tab wiring is openForTab's job (best-effort/headed, excluded from this suite),
  // so we deliberately do not assert example.com here; we assert the popup → background →
  // storage path works regardless of which tab is active.
  const tab = await context.newPage();
  await tab.goto('https://example.com');

  const popup = await ext.popup.open();

  // The popup UI renders and its active-tab readout is populated (proves popup.js ran).
  await expect(popup.getByRole('button', { name: 'Save tab' })).toBeVisible();
  await expect(popup.locator('#active-tab')).not.toHaveText('loading…');

  await popup.getByRole('button', { name: 'Save tab' }).click();

  // The click drove popup → chrome.runtime.sendMessage('SAVE') → background → storage.local.
  // The popup fires the message without awaiting the background's write, so poll the value
  // until the async write through the worker lands. The saved url is a string (the popup
  // page's own chrome-extension:// url, since that tab is active) — the point is the write
  // path works, not which tab is active.
  await expect
    .poll(() => ext.storage.local.get('saved'))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: expect.stringContaining('chrome-extension://') }),
      ]),
    );
});
