import type { Page } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';
import { toUrl } from './tabs.js';

/** A handle to a real browser window seeded with known tabs. */
export interface WindowHandle {
  /** chrome window id */
  id: number;
  /** a Playwright Page per seeded tab, in creation order */
  tabs: Page[];
  focus(): Promise<void>;
  close(): Promise<void>;
}

export class WindowsHelper {
  constructor(private readonly ext: Ext) {}

  /**
   * Open a real browser window seeded with `tabs` (full URLs or bare extension
   * paths). Returns a handle whose `tabs` are real Playwright Pages. Created
   * windows are torn down automatically when the per-test context closes;
   * `handle.close()` is available for mid-test cleanup.
   */
  async create(opts?: { tabs?: string[]; focused?: boolean }): Promise<WindowHandle> {
    const rawUrls = opts?.tabs?.length ? opts.tabs : ['about:blank'];
    const urls = rawUrls.map((u) => toUrl(this.ext, u));
    const focused = opts?.focused ?? true;

    const firstOpened = this.ext.context.waitForEvent('page', {
      predicate: (p) => {
        const u = p.url();
        return (
          u === urls[0] ||
          u === urls[0] + '/' ||
          u.startsWith(urls[0]! + '?') ||
          u.startsWith(urls[0]! + '#')
        );
      },
      timeout: 10_000,
    });

    let id: number;
    try {
      const created = await this.ext.background.evaluate(
        async ({ url, focused }) => {
          const w = await chrome.windows.create({ url, focused });
          return { id: w?.id };
        },
        { url: urls[0], focused },
      );
      if (created.id === undefined) throw new Error('chrome.windows.create returned no window id');
      id = created.id;
    } catch (e) {
      firstOpened.catch(() => {}); // suppress orphaned timeout
      throw new CrxboxError({
        code: 'window/create-failed',
        cause: e instanceof Error ? e.message : String(e),
      });
    }

    const tabs: Page[] = [await firstOpened];
    for (const u of urls.slice(1)) {
      tabs.push(await this.ext.tabs.create(u, { windowId: id }));
    }

    return {
      id,
      tabs,
      focus: async () => {
        await this.ext.background.evaluate(
          (id) => chrome.windows.update(id, { focused: true }).then(() => {}),
          id,
        );
      },
      close: async () => {
        await this.ext.background.evaluate((id) => chrome.windows.remove(id), id);
      },
    };
  }
}
