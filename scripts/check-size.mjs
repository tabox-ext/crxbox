import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length > 0) {
  console.error(`FAIL: crxbox must have zero runtime dependencies, found: ${deps.join(', ')}`);
  process.exit(1);
}

const MAX_KB = 100; // packed-size budget; bump deliberately, never silently
const out = execSync('npm pack --dry-run --json', { encoding: 'utf8' });
const sizeKb = JSON.parse(out)[0].size / 1024;
if (sizeKb > MAX_KB) {
  console.error(`FAIL: packed size ${sizeKb.toFixed(1)}KB exceeds budget ${MAX_KB}KB`);
  process.exit(1);
}
console.log(`OK: 0 runtime deps, packed size ${sizeKb.toFixed(1)}KB <= ${MAX_KB}KB`);
