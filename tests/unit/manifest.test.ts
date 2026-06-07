import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDefaultPopup } from '../../src/loader';

function tmpManifest(manifest: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crxbox-mf-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

describe('readDefaultPopup', () => {
  it('returns the MV3 action.default_popup', () => {
    const dir = tmpManifest({ manifest_version: 3, action: { default_popup: 'index.html' } });
    expect(readDefaultPopup(dir)).toBe('index.html');
  });

  it('falls back to MV2 browser_action.default_popup', () => {
    const dir = tmpManifest({ manifest_version: 2, browser_action: { default_popup: 'pop.html' } });
    expect(readDefaultPopup(dir)).toBe('pop.html');
  });

  it("defaults to 'popup.html' when no popup is declared", () => {
    const dir = tmpManifest({ manifest_version: 3, action: {} });
    expect(readDefaultPopup(dir)).toBe('popup.html');
  });

  it("defaults to 'popup.html' when the manifest is missing or unreadable", () => {
    expect(readDefaultPopup(path.join(os.tmpdir(), 'crxbox-does-not-exist-xyz'))).toBe('popup.html');
  });
});
