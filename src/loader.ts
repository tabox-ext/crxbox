import { chromium, type BrowserContext, type LaunchOptions } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
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

/**
 * Pure comparison: given the `@playwright/test` path resolved from crxbox's own
 * module and the one resolved from the consumer, return the offending pair when
 * they differ (two distinct copies → Playwright's "Requiring second time" crash),
 * or null when they match / either could not be resolved.
 */
export function findDuplicatePlaywright(
  crxboxPath: string | null,
  consumerPath: string | null,
): { crxboxPath: string; consumerPath: string } | null {
  if (!crxboxPath || !consumerPath || crxboxPath === consumerPath) return null;
  return { crxboxPath, consumerPath };
}

/**
 * Best-effort guard against the single biggest adoption papercut: two
 * @playwright/test instances on disk (e.g. a live-symlinked dev checkout that
 * ships its own node_modules). Resolves the module from crxbox's own location
 * and from the consumer's cwd; if they realpath to different files, throws a
 * crxbox diagnostic instead of letting Playwright fail cryptically. If either
 * side can't be resolved, the check is skipped — it must never mask a real launch.
 */
export function assertSinglePlaywright(): void {
  let crxboxPath: string | null = null;
  let consumerPath: string | null = null;
  try {
    crxboxPath = fs.realpathSync(createRequire(import.meta.url).resolve('@playwright/test'));
    const consumerRequire = createRequire(path.join(process.cwd(), '__crxbox_probe__.js'));
    consumerPath = fs.realpathSync(consumerRequire.resolve('@playwright/test'));
  } catch {
    return; // couldn't resolve from one side — skip the best-effort check
  }
  const dup = findDuplicatePlaywright(crxboxPath, consumerPath);
  if (dup) {
    throw new CrxboxError({
      code: 'loader/duplicate-playwright',
      crxboxPath: dup.crxboxPath,
      consumerPath: dup.consumerPath,
    });
  }
}

export async function launchWithExtension(opts: LoadOptions): Promise<BrowserContext> {
  assertSinglePlaywright();
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
