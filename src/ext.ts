import type { BrowserContext } from '@playwright/test';

export interface ExtOptions {
  path: string;
  key?: string;
}

export class Ext {
  constructor(
    readonly context: BrowserContext,
    readonly id: string,
    readonly options: ExtOptions,
  ) {}

  url(p: string): string {
    return `chrome-extension://${this.id}/${p.replace(/^\//, '')}`;
  }
}
