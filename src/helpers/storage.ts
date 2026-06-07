import type { Ext } from '../ext.js';

export type Area = 'local' | 'sync' | 'session';

export class StorageArea {
  constructor(
    private readonly ext: Ext,
    readonly area: Area,
  ) {}

  async get(key?: string): Promise<unknown> {
    return this.ext.background.evaluate(
      async ({ area, key }) => {
        const all = await chrome.storage[area].get(key ?? null);
        return key ? (all as Record<string, unknown>)[key] : all;
      },
      { area: this.area, key },
    );
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.ext.background.evaluate(
      async ({ area, items }) => {
        await chrome.storage[area].set(items);
      },
      { area: this.area, items },
    );
  }

  async clear(): Promise<void> {
    await this.ext.background.evaluate(
      async ({ area }) => {
        await chrome.storage[area].clear();
      },
      { area: this.area },
    );
  }
}

export class StorageHelper {
  readonly local: StorageArea;
  readonly sync: StorageArea;
  readonly session: StorageArea;

  constructor(ext: Ext) {
    this.local = new StorageArea(ext, 'local');
    this.sync = new StorageArea(ext, 'sync');
    this.session = new StorageArea(ext, 'session');
  }

  async clearAll(): Promise<void> {
    await Promise.all([this.local.clear(), this.sync.clear(), this.session.clear()]);
  }
}
