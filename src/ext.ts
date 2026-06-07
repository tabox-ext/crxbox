import type { BrowserContext, Page } from '@playwright/test';
import { BackgroundHelper } from './helpers/background.js';
import { StorageHelper } from './helpers/storage.js';
import { PopupHelper } from './helpers/popup.js';
import { ContentUi, type ContentUiOptions } from './helpers/content-ui.js';

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

  async contentUi(page: Page, opts: ContentUiOptions): Promise<ContentUi> {
    const ui = new ContentUi(this, page, opts);
    await ui.waitForReady(); // structured diagnostic up front (matches `await ext.contentUi(...)`)
    return ui;
  }
}
