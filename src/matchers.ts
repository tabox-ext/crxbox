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

    // Asymmetric matchers (arrayContaining/objectContaining) stringify poorly via JSON,
    // so render them with String(); plain values render as JSON.
    const fmt = (v: unknown): string =>
      v && typeof (v as { asymmetricMatch?: unknown }).asymmetricMatch === 'function'
        ? String(v)
        : JSON.stringify(v);

    return {
      pass,
      message: () =>
        `expected storage.${received.area}["${key}"] ${pass ? 'not ' : ''}to equal expected\n` +
        `  expected: ${fmt(expected)}\n` +
        `  received: ${fmt(actual)}`,
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
