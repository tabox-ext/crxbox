import { defineConfig } from 'tsup';
import { cpSync, mkdirSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'], // ESM-only — leaner; avoids the dual-.d.ts hazard (see Research notes)
  dts: true,
  clean: true,
  onSuccess: async () => {
    mkdirSync('skill', { recursive: true });
    cpSync('src/skill/SKILL.md', 'skill/SKILL.md');
  },
});
