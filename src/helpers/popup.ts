import type { Page } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';
import { readDefaultPopup } from '../loader.js';

export interface PopupOpenOptions {
  /** Size the popup page to mimic a real Chrome action popup (default: Playwright's viewport). */
  viewport?: { width: number; height: number };
}

export class PopupHelper {
  private defaultPopup?: string;

  constructor(private readonly ext: Ext) {}

  /** The popup path to use when the caller doesn't pass one — read once from the manifest. */
  private resolvePopupPath(popupPath?: string): string {
    if (popupPath) return popupPath;
    this.defaultPopup ??= readDefaultPopup(this.ext.options.path);
    return this.defaultPopup;
  }

  /**
   * popup-as-page: open the popup in a normal page for logic/UI assertions (~90% of cases).
   * Defaults to the manifest's `action.default_popup` when `popupPath` is omitted.
   * Pass `{ viewport }` (or set the fixture `popupViewport`) to mimic a real popup's
   * small dimensions for layout-sensitive assertions.
   */
  async open(popupPath?: string, opts?: PopupOpenOptions): Promise<Page> {
    const page = await this.ext.context.newPage();
    const viewport = opts?.viewport ?? this.ext.options.popupViewport;
    if (viewport) await page.setViewportSize(viewport);
    await page.goto(this.ext.url(this.resolvePopupPath(popupPath)));
    return page;
  }

  /**
   * open-for-correct-tab: drive the real action popup from the SW so it binds to the active
   * tab. Requires Chrome 127+ (openPopup stable) and a focused window. Best-effort — see note.
   * Defaults to the manifest's `action.default_popup` when `popupPath` is omitted.
   */
  async openForTab(activeTab: Page, popupPath?: string): Promise<Page> {
    await activeTab.bringToFront();
    const resolvedPath = this.resolvePopupPath(popupPath);
    const prefix = this.ext.url('');
    const opened = this.ext.context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(prefix + resolvedPath),
      timeout: 5_000,
    });
    // openPopup targets the FOCUSED window — bringToFront on the tab isn't enough, so focus
    // the window too. Capture the real error so a genuine failure isn't masked by the timeout.
    const lastError = await this.ext.background.evaluate(async () => {
      try {
        const win = await chrome.windows.getLastFocused();
        if (win.id !== undefined) await chrome.windows.update(win.id, { focused: true });
        await chrome.action.openPopup(win.id !== undefined ? { windowId: win.id } : undefined);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    });
    if (lastError) {
      opened.catch(() => {}); // suppress the now-orphaned waitForEvent timeout rejection
      throw new CrxboxError({ code: 'popup/no-active-tab', popupPath: resolvedPath, cause: lastError });
    }
    return opened.catch(() => {
      throw new CrxboxError({ code: 'popup/no-active-tab', popupPath: resolvedPath });
    });
  }
}
