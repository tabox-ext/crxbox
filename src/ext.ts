import type { BrowserContext, Dialog, Locator, Page } from '@playwright/test';
import { BackgroundHelper } from './helpers/background.js';
import { StorageHelper } from './helpers/storage.js';
import { PopupHelper } from './helpers/popup.js';
import { ContentUi, type ContentUiOptions } from './helpers/content-ui.js';
import { dragAndDrop as runDragAndDrop, type DragOptions } from './interactions.js';

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

  /**
   * Auto-accept every dialog (confirm/alert/prompt) on a page. Extension flows
   * gate destructive actions behind `window.confirm`; Playwright's default is to
   * dismiss unhandled dialogs, silently aborting the action. Returns a disposer
   * that detaches the handler.
   */
  acceptDialogs(page: Page): () => void {
    const handler = (dialog: Dialog) => {
      void dialog.accept();
    };
    page.on('dialog', handler);
    return () => page.off('dialog', handler);
  }

  /**
   * Robust pointer drag from `source` to `target` that trips activation-distance
   * sensors (dnd-kit, react-dnd, …) where `locator.dragTo()` silently no-ops.
   */
  async dragAndDrop(source: Locator, target: Locator, opts?: DragOptions): Promise<void> {
    await runDragAndDrop(source, target, opts);
  }

  async contentUi(page: Page, opts: ContentUiOptions): Promise<ContentUi> {
    const ui = new ContentUi(this, page, opts);
    await ui.waitForReady(); // structured diagnostic up front (matches `await ext.contentUi(...)`)
    return ui;
  }
}
