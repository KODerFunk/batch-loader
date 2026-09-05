import { defineConfig } from 'tsup'

// .mjs for ESM makes the format self-describing: the root package.json keeps no
// "type" field, so the dev toolchain (jest/ts-node/eslint) stays untouched
export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  outExtension: ({ format }) => ({ js: format === 'esm' ? '.mjs' : '.js' }),
  sourcemap: true,
  target: 'es2022',
})
