import { defineConfig } from 'vitest/config';

// The source uses `.js` suffixes in import paths (NodeNext style) so the
// compiled CJS output resolves correctly. Vite resolves imports literally,
// so we strip the `.js` suffix during test resolution to point at the
// underlying `.ts` source.
export default defineConfig({
  plugins: [
    {
      name: 'strip-js-extension',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (importer && source.startsWith('.') && source.endsWith('.js')) {
          const resolved = await this.resolve(source.replace(/\.js$/, ''), importer, { skipSelf: true });
          if (resolved) return resolved;
        }
        return null;
      },
    },
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
