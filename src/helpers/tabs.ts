import type { Page } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';

/** Serializable tab descriptor returned by `ext.tabs.query`. */
export interface TabInfo {
  id?: number;
  windowId?: number;
  url?: string;
  active: boolean;
  index: number;
}

/** Resolve a bare extension path to a full URL; pass through real URLs and about:blank. */
export function toUrl(ext: Ext, u: string): string {
  if (u === 'about:blank' || /^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u;
  return ext.url(u);
}

export class TabsHelper {
  constructor(private readonly ext: Ext) {}

  /**
   * Open a new tab and return its Playwright `Page`. `url` may be a full URL or a
   * bare extension path (resolved via `ext.url`). The new target is captured via a
   * `page` event so you get a real Page handle back.
   */
  async create(url: string, opts?: { windowId?: number; active?: boolean }): Promise<Page> {
    const target = toUrl(this.ext, url);
    const opened = this.ext.context.waitForEvent('page', {
      predicate: (p) => p.url() === target || p.url().startsWith(target),
      timeout: 10_000,
    });
    await this.ext.background.evaluate(
      async ({ url, windowId, active }) => {
        await chrome.tabs.create({ url, windowId, active });
      },
      { url: target, windowId: opts?.windowId, active: opts?.active },
    );
    return opened;
  }

  /** Query open tabs (SW `chrome.tabs.query`), returning serializable descriptors. */
  async query(filter?: chrome.tabs.QueryInfo): Promise<TabInfo[]> {
    const tabs = await this.ext.background.evaluate(async (f) => {
      const result = await chrome.tabs.query(f ?? {});
      return result.map((t) => ({
        id: t.id,
        windowId: t.windowId,
        url: t.url,
        active: t.active,
        index: t.index,
      }));
    }, filter);
    return tabs as TabInfo[];
  }

  /** Close a tab by its Playwright `Page` (matched by URL) or by numeric tab id. */
  async close(tab: Page | number): Promise<void> {
    let tabId: number | undefined;
    if (typeof tab === 'number') {
      tabId = tab;
    } else {
      const url = tab.url();
      const all = await this.query({});
      tabId = all.find((t) => t.url === url)?.id;
      if (tabId === undefined) throw new CrxboxError({ code: 'tabs/not-found', url });
    }
    await this.ext.background.evaluate((id) => chrome.tabs.remove(id), tabId);
  }
}
