# Getting Started

crxbox is a thin layer of fixtures and helpers on top of
[`@playwright/test`](https://playwright.dev). It does **not** replace Playwright
or build your extension — it adds first-class APIs for the surfaces Playwright
doesn't understand: the **popup**, **content-script UI**, the **background
service worker**, **storage**, and the **extension ID / URLs**.

## Install

crxbox has zero runtime dependencies of its own. Playwright is a peer dependency
you provide, and Chromium is installed via Playwright.

```bash
npm install -D crxbox @playwright/test
npx playwright install chromium
```

## Quickstart

```ts
import { test, expect } from 'crxbox';

test.use({ extensionPath: './dist' });

test('save the current tab from the popup', async ({ ext, page }) => {
  await page.goto('https://example.com');
  const popup = await ext.popup.open();                 // opens your manifest's default_popup
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(ext.storage.local).toHaveStorageValue('saved', expect.anything());
});
```

`test.use({ extensionPath })` points crxbox at your built, unpacked extension
(the directory containing `manifest.json`). From there, the `ext` fixture gives
you the extension-aware helpers.

## Next steps

- [API Reference](/api) — every method on the `ext` fixture, the matchers, and error codes.
- [Fixture extension guide](/guides/fixture-extension) — the test extension crxbox uses.
- [CI integration](/guides/ci) — run your crxbox suite on GitHub Actions, GitLab CI, CircleCI, and Jenkins.
