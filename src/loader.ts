import { chromium, type BrowserContext } from '@playwright/test';
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
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  });
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
