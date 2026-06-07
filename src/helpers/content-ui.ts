import type { Page, Locator, FrameLocator } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';

export interface ContentUiOptions {
  /** Selector of the injected root element. */
  root: string;
  /**
   * The root hosts a Shadow root (must be open). Documents intent only — Playwright always
   * pierces open shadow DOM, so `shadow: false` does NOT disable piercing.
   */
  shadow?: boolean;
  /** Scope into an iframe by selector before locating the root. */
  frame?: string;
  /** Readiness timeout (ms). */
  timeout?: number;
}

export class ContentUi {
  private readonly timeout: number;

  constructor(
    private readonly ext: Ext,
    private readonly page: Page,
    private readonly opts: ContentUiOptions,
  ) {
    this.timeout = opts.timeout ?? 5_000;
  }

  private scope(): Page | FrameLocator {
    return this.opts.frame ? this.page.frameLocator(this.opts.frame) : this.page;
  }

  private rootLocator(): Locator {
    return this.scope().locator(this.opts.root);
  }

  async waitForReady(): Promise<void> {
    // One shared budget across both waits, so the worst case is `timeout` total, not 2×.
    const deadline = Date.now() + this.timeout;
    // If a frame is expected, confirm the <iframe> element exists in the outer page first,
    // so a missing frame is reported as wrong-frame rather than not-injected.
    if (this.opts.frame) {
      const frameHost = this.page.locator(this.opts.frame);
      try {
        await frameHost.waitFor({ state: 'attached', timeout: this.timeout });
      } catch {
        throw new CrxboxError({
          code: 'content-ui/wrong-frame',
          root: this.opts.root,
          frame: this.opts.frame,
          sawFrames: this.page.frames().map((f) => f.url() || f.name() || 'about:blank'),
          waitedMs: this.timeout,
        });
      }
    }
    try {
      // max(1, …): Playwright treats timeout 0 as "no timeout", so never pass 0.
      const remaining = Math.max(1, deadline - Date.now());
      await this.rootLocator().waitFor({ state: 'attached', timeout: remaining });
    } catch {
      throw new CrxboxError({
        code: 'content-ui/not-injected',
        root: this.opts.root,
        expectedFrame: this.opts.frame ?? 'main',
        sawFrames: this.page.frames().map((f) => f.url() || f.name() || 'about:blank'),
        waitedMs: this.timeout,
      });
    }
  }

  locator(selector: string): Locator {
    return this.rootLocator().locator(selector);
  }

  getByRole(...args: Parameters<Locator['getByRole']>): Locator {
    return this.rootLocator().getByRole(...args);
  }

  getByText(...args: Parameters<Locator['getByText']>): Locator {
    return this.rootLocator().getByText(...args);
  }
}
