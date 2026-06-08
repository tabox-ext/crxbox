import { test, expect, EXT_PATH } from './_setup.js';

test.use({ extensionPath: EXT_PATH });

// Regression: ext.windows.create / ext.tabs.create used to hang (10s timeout) on data: URLs
// because toUrl required `://` and mis-resolved schemeless-but-absolute URLs (data:, about:,
// blob:) into chrome-extension://<id>/<the-url>, which the page-capture predicate never matched.
// Schemed URLs must pass through untouched; only bare paths resolve via ext.url.

const DATA_URL = 'data:text/html,<title>seed</title><h1>hi</h1>';

test('tabs.create passes a data: URL through untouched (no mangling, no hang)', async ({ ext }) => {
  const page = await ext.tabs.create(DATA_URL);
  expect(page.url()).toBe(DATA_URL);
});

test('windows.create seeds data: and about:blank tabs without hanging', async ({ ext }) => {
  const handle = await ext.windows.create({ tabs: [DATA_URL, 'about:blank'] });
  expect(handle.tabs).toHaveLength(2);
  expect(handle.tabs[0]!.url()).toBe(DATA_URL);
  expect(handle.tabs[1]!.url()).toBe('about:blank');
});
