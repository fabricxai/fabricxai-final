import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/** Unit tests: pure logic only, no database. Integration lives in vitest.integration.config.ts. */
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: [
      'src/**/__tests__/**/*.integration.test.ts',
      // `__tests__/browser/` is the jsdom project (plan 7.2). Its files are `.ts` as well as
      // `.tsx` — `use-offline-queue.ts` needs a DOM without being a component — so the split
      // is by FOLDER, and this config would otherwise run them in node, where `indexedDB` is
      // undefined and all twelve fail at once.
      'src/**/__tests__/browser/**',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next resolves `server-only` through its own alias at build time, so the marker is
      // real in the app and unresolvable here. Pointing at Next's own copy keeps the
      // import honest in both places rather than deleting a guard to satisfy a test.
      'server-only': fileURLToPath(
        new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url),
      ),
    },
  },
})
