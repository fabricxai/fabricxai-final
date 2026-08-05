import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/** Unit tests: pure logic only, no database. Integration lives in vitest.integration.config.ts. */
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['src/**/__tests__/**/*.integration.test.ts'],
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
