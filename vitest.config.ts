import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/** Unit tests: pure logic only, no database. Integration lives in vitest.integration.config.ts. */
export default defineConfig({
  test: {
    // `docs/__tests__` is here too: the handoff contract check reads markdown and asserts
    // against source, and it belongs in the fast suite for the same reason every other
    // source scan does.
    include: ['src/**/__tests__/**/*.test.ts', 'docs/__tests__/**/*.test.ts'],
    exclude: [
      'src/**/__tests__/**/*.integration.test.ts',
      // `__tests__/browser/` is the jsdom project (plan 7.2). Its files are `.ts` as well as
      // `.tsx` — `use-offline-queue.ts` needs a DOM without being a component — so the split
      // is by FOLDER, and this config would otherwise run them in node, where `indexedDB` is
      // undefined and all twelve fail at once.
      'src/**/__tests__/browser/**',
    ],
    environment: 'node',

    /*
     * JUnit alongside the readable reporter, in CI only (plan 7.3, audit TEST-M10).
     *
     * Nothing consumed a machine-readable result before, so a failing test was a line in a
     * log somebody had to scroll — no annotation on the pull request, no history of which
     * test has failed six times this month. `default` stays so a local run reads the same.
     */
    reporters: process.env.CI ? ['default', ['junit', { outputFile: 'reports/unit.xml' }]] : ['default'],

    coverage: {
      provider: 'v8',
      // `json-summary` is what the ratchet reads; `text` is for a person watching a run.
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage/unit',
      /*
       * What the number is ABOUT.
       *
       * Coverage over a whole Next app measures how much of it is a React component, which is
       * not a question anybody needs answered — 200 `.tsx` files would swamp the figure and
       * move it every time a screen was added. Scoped to the layer where a mistake is a wrong
       * number in a factory's books: services, pure logic and lib.
       */
      include: ['src/modules/**/*.ts', 'src/lib/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        // Schema and zod are declarations. Their "coverage" is whether a table exists.
        'src/modules/**/schema.ts',
        'src/modules/**/zod.ts',
        'src/db/**',
        // `actions.ts` is a thin auth → zod → service shim by design (rule 1); it is covered
        // by integration tests that vitest's node project cannot see.
        'src/modules/**/actions.ts',
      ],
    },
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
