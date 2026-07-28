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
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
