import type { Worker } from '@playwright/test';
import type { Ext } from '../ext.js';
import { CrxboxError } from '../diagnostics.js';

export class BackgroundHelper {
  constructor(private readonly ext: Ext) {}

  private async worker(): Promise<Worker> {
    let [sw] = this.ext.context.serviceWorkers();
    if (!sw) {
      sw = await this.ext.context
        .waitForEvent('serviceworker', { timeout: 10_000 })
        .catch(() => {
          throw new CrxboxError({ code: 'loader/sw-timeout' });
        });
    }
    return sw;
  }

  async evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R> {
    const sw = await this.worker();
    try {
      // Playwright stalls evaluate() across a SW restart and resumes automatically.
      return (await sw.evaluate(fn as never, arg as never)) as R;
    } catch (e) {
      throw new CrxboxError({ code: 'background/eval-failed', cause: String(e) });
    }
  }

  /**
   * Send a runtime message to the service worker and return its response.
   * Chrome does NOT deliver `chrome.runtime.sendMessage` to a listener in the *same*
   * context that sent it — so this cannot be dispatched from inside the SW (the receiving
   * end would not exist). Instead it is sent from a real extension-page sender, which is
   * how an extension's own pages message its SW in production. A blank extension page is
   * opened transiently if none is already available.
   */
  async sendMessage<R = unknown>(message: unknown): Promise<R> {
    const prefix = this.ext.url('');
    const existing = this.ext.context.pages().find((p) => p.url().startsWith(prefix));
    // manifest.json is guaranteed to exist for every extension and loads on the extension
    // origin, so a page there has full chrome.runtime access to message the SW.
    const senderUrl = this.ext.url('manifest.json');
    const page = existing ?? (await this.ext.context.newPage());
    try {
      if (!existing) await page.goto(senderUrl);
      return (await page.evaluate(
        (msg) => chrome.runtime.sendMessage(msg),
        message,
      )) as R;
    } catch (e) {
      throw new CrxboxError({ code: 'background/eval-failed', cause: String(e) });
    } finally {
      if (!existing) await page.close().catch(() => {});
    }
  }

  /**
   * Probe the worker until it responds. Each probe is bounded so a stalled evaluate()
   * (e.g. a SW that has not been woken yet) can't hang the call. After a forced kill(),
   * wake the SW with a real event first (see kill() docs) — this only confirms readiness.
   */
  async waitForReady(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      const probe = (await Promise.race([
        this.evaluate(() => typeof chrome?.runtime?.id === 'string').then(
          (ok) => ({ ok }),
          (err) => ({ err }),
        ),
        new Promise((resolve) => setTimeout(() => resolve({ pending: true }), 1_000)),
      ])) as { ok?: boolean; err?: unknown; pending?: boolean };
      if (probe.ok) return;
      if (probe.err) lastError = probe.err;
    }
    throw new CrxboxError({ code: 'background/restart-timeout', cause: String(lastError) });
  }

  /**
   * Forcefully terminate the MV3 service worker via CDP (not natural idle suspend).
   * Verified technique: `ServiceWorker.enable` + `stopAllWorkers` over a *page-attached*
   * CDP session — newCDPSession accepts a Page/Frame only, NOT a service-worker target.
   * This only STOPS the worker; it restarts on the next real event (a message from a page
   * or extension page, a navigation it listens for, etc.). Playwright reuses the same
   * Worker object and fires no new 'serviceworker' event — so after kill(), drive a real
   * action to wake it rather than waiting for an event.
   */
  async kill(): Promise<void> {
    const page = this.ext.context.pages()[0] ?? (await this.ext.context.newPage());
    const client = await this.ext.context.newCDPSession(page);
    try {
      await client.send('ServiceWorker.enable');
      await client.send('ServiceWorker.stopAllWorkers');
    } finally {
      await client.detach().catch(() => {});
    }
  }
}
