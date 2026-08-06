import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Integration tests: services against a real Postgres via Testcontainers (dev-plan §7).
 * The permanent cross-tenant test lives here — user A querying company B must return
 * zero rows, forever, in CI.
 *
 * ⚠ Testcontainers setup lands in Phase 0 session 4 (CI).
 */
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.integration.test.ts'],
    // Belt and braces with the unit config's exclude: the jsdom project owns `browser/`.
    exclude: ['src/**/__tests__/browser/**'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Containers are expensive; suites share one database and isolate by company.
    fileParallelism: false,
    setupFiles: ['dotenv/config'],
    globalSetup: ['./vitest.globalsetup.integration.ts'],
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
