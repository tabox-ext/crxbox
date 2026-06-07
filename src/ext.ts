import type { BrowserContext, Page } from '@playwright/test';
import { BackgroundHelper } from './helpers/background.js';
import { StorageHelper } from './helpers/storage.js';
import { PopupHelper } from './helpers/popup.js';
import { ContentUi, type ContentUiOptions } from './helpers/content-ui.js';

export interface ExtOptions {
  path: string;
  /** Reserved for a future deterministic-ID feature; not yet wired in v1. */
  key?: string;
  /** Default viewport applied by `popup.open()` when no per-call viewport is given. */
  popupViewport?: { width: number; height: number };
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

  /**
   * Open any extension page (options page, full-page view, sandbox) as a normal
   * page and return it — the neutral sibling of `popup.open()` for non-popup pages.
   */
  async openPage(p: string, opts?: { viewport?: { width: number; height: number } }): Promise<Page> {
    const page = await this.context.newPage();
    if (opts?.viewport) await page.setViewportSize(opts.viewport);
    await page.goto(this.url(p));
    return page;
  }

  async contentUi(page: Page, opts: ContentUiOptions): Promise<ContentUi> {
    const ui = new ContentUi(this, page, opts);
    await ui.waitForReady(); // structured diagnostic up front (matches `await ext.contentUi(...)`)
    return ui;
  }
}
