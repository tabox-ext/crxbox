import { chromium, type BrowserContext, type LaunchOptions } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { CrxboxError } from './diagnostics.js';

export interface LoadOptions {
  path: string;
  /**
   * Reserved for a future deterministic-extension-ID feature (injecting a `key`
   * into the loaded manifest). Not yet wired in v1 — setting it has no effect.
   */
  key?: string;
  /**
   * Playwright launch options to forward to `launchPersistentContext` — e.g.
   * `headless`, `slowMo`, `devtools`, `channel`, `args`. The fixture feeds the
   * test's resolved Playwright config here, so `--headed`, `PWDEBUG=1`, and
   * `use: { launchOptions: { slowMo } }` are honored. Any `args` provided are
   * appended to (not replaced by) the two args crxbox needs to load the extension.
   */
  launchOptions?: LaunchOptions;
}

/**
 * Build the final `launchPersistentContext` options: crxbox's two required
 * extension args always come first, the caller's `args` are appended (never
 * replaced), `channel` defaults to `'chromium'` but is overridable, and every
 * other Playwright launch option (`headless`, `slowMo`, `devtools`, …) passes
 * through untouched. Pure + exported so the merge contract is unit-tested.
 */
export function buildPersistentContextOptions(
  extPath: string,
  launchOptions?: LaunchOptions,
): LaunchOptions {
  const { args: userArgs = [], channel, ...rest } = launchOptions ?? {};
  return {
    channel: channel ?? 'chromium',
    ...rest,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      ...userArgs,
    ],
  };
}

export async function launchWithExtension(opts: LoadOptions): Promise<BrowserContext> {
  if (!opts.path) {
    throw new CrxboxError({
      code: 'loader/build-not-found',
      path: '(empty — extensionPath option is not set)',
    });
  }
  const extPath = path.resolve(opts.path);
  if (!fs.existsSync(path.join(extPath, 'manifest.json'))) {
    throw new CrxboxError({ code: 'loader/build-not-found', path: extPath });
  }
  return chromium.launchPersistentContext('', buildPersistentContextOptions(extPath, opts.launchOptions));
}

/**
 * Resolve the extension's default popup page from its manifest
 * (`action.default_popup`, MV2 `browser_action.default_popup`), falling back to
 * `popup.html`. Lets `ext.popup.open()` work without the caller knowing the popup
 * filename. Returns the fallback if the manifest is missing or unreadable.
 */
export function readDefaultPopup(extPath: string): string {
  try {
    const raw = fs.readFileSync(path.join(path.resolve(extPath), 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw) as {
      action?: { default_popup?: string };
      browser_action?: { default_popup?: string };
    };
    return (
      manifest.action?.default_popup ?? manifest.browser_action?.default_popup ?? 'popup.html'
    );
  } catch {
    return 'popup.html';
  }
}

export async function resolveExtensionId(context: BrowserContext): Promise<string> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context
      .waitForEvent('serviceworker', { timeout: 10_000 })
      .catch(() => {
        throw new CrxboxError({ code: 'loader/sw-timeout' });
      });
  }
  return sw.url().split('/')[2]!;
}
