// tests/unit/diagnostics.test.ts
import { describe, it, expect } from 'vitest';
import { CrxboxError, formatMessage } from '../../src/diagnostics';

describe('formatMessage', () => {
  it('renders head, single-line json block, and hint', () => {
    const msg = formatMessage(
      { code: 'content-ui/not-injected', root: '[data-ext-root]', expectedFrame: 'main', sawFrames: ['main'], waitedMs: 5000 },
      'content-ui readiness timeout',
    );
    expect(msg).toContain('content-ui readiness timeout');
    expect(msg).toContain('crxbox: {"code":"content-ui/not-injected"');
    expect(msg).toContain('"root":"[data-ext-root]"');
    expect(msg).toContain('hint:');
    // json block must be a single line
    const jsonLine = msg.split('\n').find((l) => l.includes('crxbox:'))!;
    expect(jsonLine).not.toContain('\n');
    expect(() => JSON.parse(jsonLine.slice(jsonLine.indexOf('{')))).not.toThrow();
  });
});

describe('CrxboxError', () => {
  it('exposes the structured diagnostic and code', () => {
    const err = new CrxboxError({ code: 'loader/build-not-found', path: '/x' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CrxboxError');
    expect(err.diagnostic.code).toBe('loader/build-not-found');
    expect(err.message).toContain('"path":"/x"');
  });
});

describe('loader/duplicate-playwright hint', () => {
  it('renders a hint for the duplicate-playwright code', () => {
    const err = new CrxboxError({
      code: 'loader/duplicate-playwright',
      crxboxPath: '/a',
      consumerPath: '/b',
    });
    expect(err.message).toContain('hint:');
    expect(err.diagnostic.code).toBe('loader/duplicate-playwright');
  });
});

describe('window/tabs diagnostics', () => {
  it('renders hints for window/create-failed, tabs/not-found, and tabs/create-failed', () => {
    for (const code of ['window/create-failed', 'tabs/not-found', 'tabs/create-failed'] as const) {
      const err = new CrxboxError({ code });
      expect(err.diagnostic.code).toBe(code);
      expect(err.message).toContain('hint:');
    }
  });
});
