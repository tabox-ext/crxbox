import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'], // ESM-only — leaner; avoids the dual-.d.ts hazard (see Research notes)
  dts: true,
  clean: true,
});
