import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Frontend tests — the third vitest project (plan 7.2, audit TEST-H8).
 *
 * `vitest.config.ts` and `vitest.integration.config.ts` are both `environment: 'node'` and
 * both collect `.ts` only, so **no `.tsx` file in this repo was reachable by any test**. That
 * is 200-odd components, every floor screen, and the two pieces of client code with real
 * logic in them: the offline queue that decides whether a factory's writes survive a dead
 * access point, and the approve inbox that decides what a reviewer sees before signing.
 *
 * Not a gap in coverage — a gap in what could be covered at all.
 *
 * ## A separate project rather than widening the unit config
 *
 * jsdom is slower to start and its globals (`window`, `document`, `navigator`) change how
 * server-side code behaves — `lib/env.ts` throws outright if `window` is defined, deliberately.
 * Keeping the environments apart means the 933 node tests stay fast and honest, and a
 * component test cannot accidentally exercise a service against a fake DOM.
 *
 * ## Why `.tsx` only here
 *
 * `use-offline-queue.ts` is a `.ts` file that needs a browser, so the include covers both —
 * but scoped to `__tests__/browser/`, so choosing the jsdom project is a deliberate act of
 * putting the file in that folder rather than something inferred from an extension.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/__tests__/browser/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // `fake-indexeddb` and jest-dom's matchers, installed once per file.
    setupFiles: ['./vitest.setup.jsdom.ts'],
    // Each file gets a fresh jsdom. The offline queue is a module-level IndexedDB handle and
    // a shared one would leak a queue between suites — which is exactly the bug class these
    // tests exist to catch.
    isolate: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(
        new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url),
      ),
    },
  },
})
