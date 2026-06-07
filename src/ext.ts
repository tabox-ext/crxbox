import type { BrowserContext } from '@playwright/test';
import { BackgroundHelper } from './helpers/background.js';
import { StorageHelper } from './helpers/storage.js';

export interface ExtOptions {
  path: string;
  /** Reserved for a future deterministic-ID feature; not yet wired in v1. */
  key?: string;
}

export class Ext {
  readonly background: BackgroundHelper;
  readonly storage: StorageHelper;

  constructor(
    readonly context: BrowserContext,
    readonly id: string,
    readonly options: ExtOptions,
  ) {
    this.background = new BackgroundHelper(this);
    this.storage = new StorageHelper(this);
  }

  url(p: string): string {
    return `chrome-extension://${this.id}/${p.replace(/^\//, '')}`;
  }
}
