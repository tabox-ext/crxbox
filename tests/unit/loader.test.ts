import { describe, it, expect } from 'vitest';
import { buildPersistentContextOptions, findDuplicatePlaywright } from '../../src/loader';

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

describe('findDuplicatePlaywright', () => {
  it('returns the offending pair when the two resolved paths differ', () => {
    expect(
      findDuplicatePlaywright('/a/node_modules/@playwright/test', '/b/node_modules/@playwright/test'),
    ).toEqual({
      crxboxPath: '/a/node_modules/@playwright/test',
      consumerPath: '/b/node_modules/@playwright/test',
    });
  });

  it('returns null when both paths are identical (single shared instance)', () => {
    expect(findDuplicatePlaywright('/same/path', '/same/path')).toBeNull();
  });

  it('returns null when either path could not be resolved', () => {
    expect(findDuplicatePlaywright(null, '/b')).toBeNull();
    expect(findDuplicatePlaywright('/a', null)).toBeNull();
  });
});
