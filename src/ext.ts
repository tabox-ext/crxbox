import type { BrowserContext } from '@playwright/test';
import { BackgroundHelper } from './helpers/background.js';

export interface ExtOptions {
  path: string;
  /** Reserved for a future deterministic-ID feature; not yet wired in v1. */
  key?: string;
}

export class Ext {
  readonly background: BackgroundHelper;

  constructor(
    readonly context: BrowserContext,
    readonly id: string,
    readonly options: ExtOptions,
  ) {
    this.background = new BackgroundHelper(this);
  }

  url(p: string): string {
    return `chrome-extension://${this.id}/${p.replace(/^\//, '')}`;
  }
}
