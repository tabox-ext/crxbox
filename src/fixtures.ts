import {
  test as base,
  expect as baseExpect,
  type BrowserContext,
  type PlaywrightWorkerOptions,
} from '@playwright/test';
import { launchWithExtension, resolveExtensionId } from './loader.js';
import { Ext } from './ext.js';
import { storageMatchers } from './matchers.js';

baseExpect.extend(storageMatchers);

export interface CrxboxOptions {
  /** Path to the built, unpacked extension (the directory containing `manifest.json`). */
  extensionPath: string;
  /**
   * Reserved for a future deterministic-extension-ID feature; not yet wired in v1.
   * Setting it currently has no effect.
   */
  extensionKey?: string;
  /**
   * Default viewport for `ext.popup.open()` — pin it to your extension's real
   * popup dimensions so layout-sensitive assertions match production. A per-call
   * `open({ viewport })` overrides this.
   */
  popupViewport?: { width: number; height: number };
}

export interface CrxboxFixtures {
  context: BrowserContext;
  ext: Ext;
}

export function createExtensionFixtures(
  config: { path?: string; key?: string; popupViewport?: { width: number; height: number } } = {},
) {
  return {
    extensionPath: [config.path ?? '', { option: true }],
    extensionKey: [config.key, { option: true }],
    popupViewport: [config.popupViewport, { option: true }],

    context: async (
      {
        extensionPath,
        extensionKey,
        headless,
        channel,
        launchOptions,
      }: CrxboxOptions & PlaywrightWorkerOptions,
      use: (c: BrowserContext) => Promise<void>,
    ) => {
      const context = await launchWithExtension({
        path: extensionPath,
        key: extensionKey,
        // Forward the test's resolved Playwright launch config (honors --headed,
        // PWDEBUG, use.launchOptions.slowMo, channel overrides, extra args).
        launchOptions: { ...launchOptions, headless, channel },
      });
      await use(context);
      await context.close();
    },

    ext: async (
      { context, extensionPath, extensionKey, popupViewport }: CrxboxFixtures & CrxboxOptions,
      use: (e: Ext) => Promise<void>,
    ) => {
      const id = await resolveExtensionId(context);
      const ext = new Ext(context, id, { path: extensionPath, key: extensionKey, popupViewport });
      await ext.storage.clearAll(); // reset state between tests
      await use(ext);
    },
  } as const;
}

export const test = base.extend<CrxboxOptions & CrxboxFixtures>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createExtensionFixtures() as any,
);
export const expect = baseExpect;
