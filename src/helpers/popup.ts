import type { Page } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';

export class PopupHelper {
  constructor(private readonly ext: Ext) {}

  /** popup-as-page: open popup.html in a normal page for logic/UI assertions (~90% of cases). */
  async open(popupPath = 'popup.html'): Promise<Page> {
    const page = await this.ext.context.newPage();
    await page.goto(this.ext.url(popupPath));
    return page;
  }

  /**
   * open-for-correct-tab: drive the real action popup from the SW so it binds to the active
   * tab. Requires Chrome 127+ (openPopup stable) and a focused window. Best-effort — see note.
   */
  async openForTab(activeTab: Page, popupPath = 'popup.html'): Promise<Page> {
    await activeTab.bringToFront();
    const prefix = this.ext.url('');
    const opened = this.ext.context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(prefix + popupPath),
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
      throw new CrxboxError({ code: 'popup/no-active-tab', cause: lastError });
    }
    return opened.catch(() => {
      throw new CrxboxError({ code: 'popup/no-active-tab', popupPath });
    });
  }
}
