# crxbox

> Playwright, but extension-aware. A lightweight toolkit for testing Chrome extensions — **zero runtime dependencies of its own** (Playwright is a peer dependency you provide; Chromium is installed via Playwright).

```ts
import { test, expect } from 'crxbox';
test.use({ extensionPath: './dist' });

test('popup renders', async ({ ext, context }) => {
  const page = await context.newPage();
  await page.goto(ext.url('popup.html'));
  await expect(page.getByRole('button', { name: 'Save tab' })).toBeVisible();
});
```

**Helpers:** `ext.id` / `ext.url` · `ext.popup` · `ext.contentUi` · `ext.background` · `ext.storage`.

**AI agents:** read `node_modules/crxbox/skill/SKILL.md` for the full API, patterns, and failure codes.

Requires `@playwright/test` (peer) and `npx playwright install chromium`. **ESM-only**, Node 18+.
