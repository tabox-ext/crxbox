import { describe, it, expect } from 'vitest';
import { buildPersistentContextOptions } from '../../src/loader';

const EXT = '/tmp/my-ext';

describe('buildPersistentContextOptions', () => {
  it('injects the two required extension args pointing at extPath', () => {
    const out = buildPersistentContextOptions(EXT);
    expect(out.args).toEqual([
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ]);
  });

  it('defaults channel to chromium and lets the caller override it', () => {
    expect(buildPersistentContextOptions(EXT).channel).toBe('chromium');
    expect(buildPersistentContextOptions(EXT, { channel: 'chrome' }).channel).toBe('chrome');
  });

  it('appends caller args after the required extension args (does not replace them)', () => {
    const out = buildPersistentContextOptions(EXT, { args: ['--lang=en-US'] });
    expect(out.args).toEqual([
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--lang=en-US',
    ]);
  });

  it('passes through headless, slowMo, and devtools untouched', () => {
    const out = buildPersistentContextOptions(EXT, { headless: false, slowMo: 250, devtools: true });
    expect(out.headless).toBe(false);
    expect(out.slowMo).toBe(250);
    expect(out.devtools).toBe(true);
  });
});
