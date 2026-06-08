import { test, expect, EXT_PATH } from './_setup.js';
import { CrxboxError } from '../../src/index.js';

test.use({ extensionPath: EXT_PATH });

// openForTab is @experimental/best-effort: in new-headless it may take the
// documented popup/no-active-tab throw path. This asserts the CONTRACT —
// either a bound popup page, or the structured diagnostic — so it documents
// behavior without flaking. Recommended usage: bind against a created focused window.
test('openForTab binds the popup or throws the documented diagnostic', async ({ ext }) => {
  const win = await ext.windows.create({ tabs: [ext.url('popup.html')], focused: true });
  const result = await ext.popup.openForTab(win.tabs[0]!).catch((e) => e);

  if (result instanceof CrxboxError) {
    expect(result.diagnostic.code).toBe('popup/no-active-tab');
  } else {
    expect(result.url()).toContain(ext.url(''));
  }
});
