import { test as base, expect as baseExpect, type BrowserContext } from '@playwright/test';
import { launchWithExtension, resolveExtensionId } from './loader.js';
import { Ext } from './ext.js';

export interface CrxboxOptions {
  /** Path to the built, unpacked extension (the directory containing `manifest.json`). */
  extensionPath: string;
  /**
   * Reserved for a future deterministic-extension-ID feature; not yet wired in v1.
   * Setting it currently has no effect.
   */
  extensionKey?: string;
}

export interface CrxboxFixtures {
  context: BrowserContext;
  ext: Ext;
}

export function createExtensionFixtures(config: { path?: string; key?: string } = {}) {
  return {
    extensionPath: [config.path ?? '', { option: true }],
    extensionKey: [config.key, { option: true }],

    context: async (
      { extensionPath, extensionKey }: CrxboxOptions,
      use: (c: BrowserContext) => Promise<void>,
    ) => {
      const context = await launchWithExtension({ path: extensionPath, key: extensionKey });
      await use(context);
      await context.close();
    },

    ext: async (
      { context, extensionPath, extensionKey }: CrxboxFixtures & CrxboxOptions,
      use: (e: Ext) => Promise<void>,
    ) => {
      const id = await resolveExtensionId(context);
      const ext = new Ext(context, id, { path: extensionPath, key: extensionKey });
      await use(ext);
    },
  } as const;
}

export const test = base.extend<CrxboxOptions & CrxboxFixtures>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createExtensionFixtures() as any,
);
export const expect = baseExpect;
