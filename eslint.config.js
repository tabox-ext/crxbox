import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config'; // ships with ESLint >= 9.22 — no extra dep

export default defineConfig([
  { ignores: ['dist', 'skill', 'fixtures/ext', 'tests', '*.config.*', 'scripts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
]);
