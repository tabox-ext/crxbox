import type { Locator } from '@playwright/test';
import { CrxboxError } from './diagnostics.js';

export interface DragOptions {
  /** Number of intermediate moves while gliding onto the target (default 12). */
  steps?: number;
  /** Pixels to nudge past the source center to exceed an activation distance (default 8). */
  nudge?: number;
  /** Pixels of final settle past the target center (default 4). */
  settle?: number;
}

/**
 * Robust pointer-based drag that reliably trips activation-distance sensors
 * (dnd-kit, react-dnd, etc.) where Playwright's single-move `locator.dragTo()`
 * no-ops: press → nudge past activation → stepped glide → settle → release.
 */
export async function dragAndDrop(
  source: Locator,
  target: Locator,
  opts: DragOptions = {},
): Promise<void> {
  const { steps = 12, nudge = 8, settle = 4 } = opts;
  const page = source.page();
  if (target.page() !== page) {
    throw new CrxboxError({ code: 'drag/cross-page' });
  }
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new CrxboxError({ code: 'drag/no-bounding-box' });
  }
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(fx, fy + nudge); // exceed the activation distance
  await page.mouse.move(tx, ty, { steps }); // glide onto the target
  const settleDir = ty >= fy ? settle : -settle; // settle past center in the direction of travel
  await page.mouse.move(tx, ty + settleDir, { steps: Math.max(2, Math.ceil(steps / 3)) });
  await page.mouse.up();
}
