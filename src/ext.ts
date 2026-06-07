import type { BrowserContext } from '@playwright/test';
import { BackgroundHelper } from './helpers/background.js';
import { StorageHelper } from './helpers/storage.js';
import { PopupHelper } from './helpers/popup.js';

export interface ExtOptions {
  path: string;
  /** Reserved for a future deterministic-ID feature; not yet wired in v1. */
  key?: string;
}

export class Ext {
  readonly background: BackgroundHelper;
  readonly storage: StorageHelper;
  readonly popup: PopupHelper;

  constructor(
    readonly context: BrowserContext,
    readonly id: string,
    readonly options: ExtOptions,
  ) {
    this.background = new BackgroundHelper(this);
    this.storage = new StorageHelper(this);
    this.popup = new PopupHelper(this);
  }

  url(p: string): string {
    return `chrome-extension://${this.id}/${p.replace(/^\//, '')}`;
  }
}
