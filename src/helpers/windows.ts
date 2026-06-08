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
   * paths). Returns a handle whose `tabs` are real Playwright Pages, in the order
   * given. If `tabs` is omitted the window opens with the browser's default tab
   * and `handle.tabs` is empty (nothing was seeded to capture).
   *
   * Created windows are torn down when the per-test Playwright context closes;
   * `handle.close()` is available for mid-test cleanup.
   */
  async create(opts?: { tabs?: string[]; focused?: boolean }): Promise<WindowHandle> {
    const focused = opts?.focused ?? true;
    const seedUrls = (opts?.tabs ?? []).map((u) => toUrl(this.ext, u));

    // Capture the first seeded tab's page event — set up BEFORE create so it can't be missed.
    const first = seedUrls[0];
    const firstOpened = first
      ? this.ext.context.waitForEvent('page', {
          predicate: (p) => {
            const u = p.url();
            return u === first || u === first + '/' || u.startsWith(first + '?') || u.startsWith(first + '#');
          },
          timeout: 10_000,
        })
      : null;

    let id: number;
    try {
      const created = await this.ext.background.evaluate(
        async ({ url, focused }) => {
          const w = await chrome.windows.create(url ? { url, focused } : { focused });
          return { id: w?.id };
        },
        { url: first, focused },
      );
      if (created.id === undefined) throw new Error('chrome.windows.create returned no window id');
      id = created.id;
    } catch (e) {
      firstOpened?.catch(() => {}); // suppress orphaned timeout
      const inner = e instanceof CrxboxError ? (e.diagnostic.cause as string | undefined) : undefined;
      const cause = inner ?? (e instanceof Error ? e.message : String(e));
      throw new CrxboxError({ code: 'window/create-failed', cause });
    }

    const tabs: Page[] = [];
    if (firstOpened) {
      tabs.push(await firstOpened);
      for (const u of seedUrls.slice(1)) {
        tabs.push(await this.ext.tabs.create(u, { windowId: id }));
      }
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
