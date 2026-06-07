// tests/integration/background.spec.ts
import { test, expect, EXT_PATH } from './_setup';

test.use({ extensionPath: EXT_PATH });

test('sendMessage gets PONG from the service worker', async ({ ext }) => {
  const res = await ext.background.sendMessage({ type: 'PING' });
  expect(res).toEqual({ type: 'PONG' });
});

test('evaluate runs in the worker context', async ({ ext }) => {
  const hasChrome = await ext.background.evaluate(() => typeof chrome.runtime?.id === 'string');
  expect(hasChrome).toBe(true);
});

test('state persists and the worker recovers after a forced kill', async ({ ext, context }) => {
  // 1) seed persistent state through the worker
  await ext.background.evaluate(async () => {
    await chrome.storage.local.set({ survived: 'yes' });
  });
  // 2) force-terminate the MV3 service worker (not idle suspend)
  await ext.background.kill();
  // 3) a real external event must wake it: load an extension page and message the worker.
  //    (popup helper lands in Task 7, so we open the extension page directly here.)
  const extPage = await context.newPage();
  await extPage.goto(ext.url('popup.html'));
  const pong = await extPage.evaluate(() => chrome.runtime.sendMessage({ type: 'PING' }));
  expect(pong).toEqual({ type: 'PONG' });
  // 4) persistent storage written before the kill is still present
  const value = await ext.background.evaluate(async () =>
    (await chrome.storage.local.get('survived')).survived,
  );
  expect(value).toBe('yes');
});
