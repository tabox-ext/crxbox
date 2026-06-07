import { expect as baseExpect } from '@playwright/test';
import type { StorageArea } from './helpers/storage.js';
import { formatMessage } from './diagnostics.js';

export const storageMatchers = {
  async toHaveStorageValue(received: StorageArea, key: string, expected: unknown) {
    const actual = await received.get(key);

    if (actual === undefined) {
      return {
        pass: false,
        message: () =>
          formatMessage({ code: 'storage/key-absent', area: received.area, key }, `expected a value at storage.${received.area}["${key}"]`),
      };
    }

    let pass = false;
    try {
      baseExpect(actual).toEqual(expected); // supports arrayContaining/objectContaining
      pass = true;
    } catch {
      pass = false;
    }

    return {
      pass,
      message: () =>
        `expected storage.${received.area}["${key}"] ${pass ? 'not ' : ''}to equal expected\n` +
        `  received: ${JSON.stringify(actual)}`,
    };
  },
};

// Type augmentation so `expect(area).toHaveStorageValue(...)` type-checks.
// Playwright's matcher interface lives in the GLOBAL `PlaywrightTest` namespace —
// augmenting the '@playwright/test' module does nothing.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace PlaywrightTest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R, T = unknown> {
      toHaveStorageValue(key: string, expected: unknown): Promise<R>;
    }
  }
}
