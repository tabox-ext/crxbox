import { test, expect, EXT_PATH } from './_setup.js';

// A caller-supplied launch arg must be APPENDED to crxbox's required extension
// args, not replace them — if it replaced them, the extension would not load
// and ext.id would never resolve.
test.use({ extensionPath: EXT_PATH, launchOptions: { args: ['--lang=en-US'] } });

test('forwards launchOptions.args while still loading the extension', async ({ ext }) => {
  expect(ext.id).toMatch(/^[a-p]{32}$/);
});
