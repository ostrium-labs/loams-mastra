import { defineConfig } from 'tsdown';

// Mirrors workflows/inngest/tsdown.config.ts in mastra-ai/mastra, except that
// declarations come from tsdown here (Mastra generates them with @internal/types-builder).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  fixedExtension: false,
  nodeProtocol: 'strip',
  clean: true,
  dts: true,
  treeshake: true,
  sourcemap: true,
});
