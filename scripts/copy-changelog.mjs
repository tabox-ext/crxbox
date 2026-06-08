// Copies the root CHANGELOG.md into the VitePress site as docs/changelog.md.
// CHANGELOG.md stays the single source of truth; docs/changelog.md is gitignored.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'CHANGELOG.md');
const dest = join(root, 'docs', 'changelog.md');

if (!existsSync(src)) {
  console.error(`copy-changelog: source not found at ${src}`);
  process.exit(1);
}
copyFileSync(src, dest);
console.log(`copy-changelog: wrote ${dest}`);
