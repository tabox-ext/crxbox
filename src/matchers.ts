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

  async toEventuallyHaveStorageValue(
    received: StorageArea,
    key: string,
    expected: unknown,
    opts?: { timeout?: number; interval?: number },
  ) {
    const timeout = opts?.timeout ?? 5_000;
    const interval = opts?.interval ?? 100;
    const deadline = Date.now() + timeout;
    let actual: unknown;
    let pass = false;
    for (;;) {
      actual = await received.get(key);
      if (actual !== undefined) {
        try {
          baseExpect(actual).toEqual(expected);
          pass = true;
        } catch {
          pass = false;
        }
      }
      if (pass || Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, interval));
    }
    const fmt = (v: unknown): string =>
      v && typeof (v as { asymmetricMatch?: unknown }).asymmetricMatch === 'function'
        ? String(v)
        : JSON.stringify(v);
    return {
      pass,
      message: () =>
        `expected storage.${received.area}["${key}"] ${pass ? 'not ' : ''}to eventually equal expected (within ${timeout}ms)\n` +
        `  expected: ${fmt(expected)}\n` +
        `  received: ${fmt(actual)}`,
    };
  },

  async toHaveStorageKeys(received: StorageArea, keys: string[]) {
    const all = (await received.get()) as Record<string, unknown> | undefined;
    const present = all ? Object.keys(all) : [];
    const missing = keys.filter((k) => !present.includes(k));
    const pass = missing.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `expected storage.${received.area} not to contain keys ${JSON.stringify(keys)}`
          : `expected storage.${received.area} to contain keys ${JSON.stringify(keys)}\n` +
            `  missing: ${JSON.stringify(missing)}\n` +
            `  present: ${JSON.stringify(present)}`,
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
      toEventuallyHaveStorageValue(
        key: string,
        expected: unknown,
        opts?: { timeout?: number; interval?: number },
      ): Promise<R>;
      toHaveStorageKeys(keys: string[]): Promise<R>;
    }
  }
}
