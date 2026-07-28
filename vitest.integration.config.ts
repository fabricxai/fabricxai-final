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
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Containers are expensive; suites share one database and isolate by company.
    fileParallelism: false,
    setupFiles: ['dotenv/config'],
    globalSetup: ['./vitest.globalsetup.integration.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
