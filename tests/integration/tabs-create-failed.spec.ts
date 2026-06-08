import { test, expect, EXT_PATH } from './_setup.js';
import { CrxboxError } from '../../src/index.js';

test.use({ extensionPath: EXT_PATH });

test('tabs.create throws tabs/create-failed (bounded) when the target window is invalid', async ({ ext }) => {
  // windowId 999999 does not exist → chrome.tabs.create rejects fast in the SW.
  const err = await ext.tabs.create(ext.url('options.html'), { windowId: 999_999 }).catch((e) => e);
  expect(err).toBeInstanceOf(CrxboxError);
  expect(err.diagnostic.code).toBe('tabs/create-failed');
});
