import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as crxTest, expect } from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EXT_PATH = path.resolve(__dirname, '../../fixtures/ext');
export const test = crxTest;
export { expect };
