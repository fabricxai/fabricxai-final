import js from '@eslint/js'
import next from 'eslint-config-next'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import analyticsNoWrites from './eslint-rules/analytics-no-writes.js'
import noFloatMoney from './eslint-rules/no-float-money.js'
import noInventedConfidence from './eslint-rules/no-invented-confidence.js'
import noLocalMoneyHelpers from './eslint-rules/no-local-money-helpers.js'
import requireTenantPredicate from './eslint-rules/require-tenant-predicate.js'

/**
 * The custom rules below are not style preferences — they are the only automated
 * enforcement behind CLAUDE.md rules 2, 3, 4 and 9. Everything else in this file is
 * conventional; these are the reason it exists.
 */
const fabricxai = {
  rules: {
    'no-float-money': noFloatMoney,
    'no-invented-confidence': noInventedConfidence,
    'analytics-no-writes': analyticsNoWrites,
    'require-tenant-predicate': requireTenantPredicate,
    'no-local-money-helpers': noLocalMoneyHelpers,
  },
}

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'src/db/migrations/**',
      'coverage/**',
      'dist/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { fabricxai },
  },

  {
    // TypeScript rules apply to TypeScript. The lint rules themselves are plain JS.
    //
    // Deliberately NOT using typed linting (`parserOptions.project`): it needs a full
    // type-check per lint run, roughly doubling CI time, and `pnpm typecheck` already
    // runs tsc over the same files. Syntactic rules here, types there.
    files: ['**/*.{ts,tsx}'],
    rules: {
      // The service layer is where a silent `any` becomes a production bug.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ── CLAUDE.md rule 4 · money is never a float ─────────────────────────────
  {
    // `src/lib` and `src/components` were outside this for months, and they are where money
    // is FORMATTED — `fx/format.tsx`, `fx/tna.tsx` — so the one layer that turns an exact
    // string into something a person reads was the one layer unchecked (audit TEST-M11).
    files: [
      'src/modules/**/*.ts',
      'src/app/**/*.{ts,tsx}',
      'src/db/**/*.ts',
      'src/worker/**/*.ts',
      'src/lib/**/*.ts',
      'src/components/**/*.{ts,tsx}',
    ],
    rules: { 'fabricxai/no-float-money': 'error' },
  },
  {
    // The two files allowed to convert, and only to display. Off here rather than disabled
    // inline so the whole exemption is one visible list rather than scattered comments.
    files: ['src/lib/money.ts', 'src/lib/quantity.ts'],
    rules: { 'fabricxai/no-float-money': 'off' },
  },

  // ── CLAUDE.md rule 4 · one implementation of scaled-BigInt money ──────────
  //
  // `lib/money.ts` and `lib/quantity.ts` are the sanctioned conversions. Fifteen files
  // carry a private copy of the same two functions (audit BE-M8) — each individually
  // exact, none sharing the tests, none carrying a currency, and all of them a place to
  // miss when a rounding convention changes.
  //
  // A SHRINK-ONLY list, like the tenant-predicate ratchet: converting twenty files is
  // module-by-module work, but a sixteenth is banned from today. Removing a file from this
  // list is the definition of progress; adding one is the thing this exists to stop.
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/lib/money.ts',
      'src/lib/quantity.ts',
      'src/modules/commercial/bank-docs.ts',
      'src/modules/commercial/ud.ts',
      'src/modules/cutting/cutting.ts',
      'src/modules/cutting/service.ts',
      'src/modules/finance/finance.ts',
      'src/modules/finance/service.ts',
      'src/modules/procurement/procurement.ts',
      'src/modules/procurement/service.ts',
      'src/modules/production/metrics.ts',
      'src/modules/quality/quality.ts',
      'src/modules/quality/service.ts',
      'src/modules/rfq/rfq.ts',
      'src/modules/rfq/service.ts',
      'src/modules/shipment/service.ts',
      'src/modules/shipment/shipment.ts',
      // Caught only once this became a real rule: these are arrow-function copies, which
      // the selector version could not see. Same debt, five more files.
      'src/modules/commercial/lc-conflicts.ts',
      'src/modules/planning/service.ts',
      'src/modules/store/service.ts',
      'src/modules/workforce/service.ts',
      '**/__tests__/**',
    ],
    rules: { 'fabricxai/no-local-money-helpers': 'error' },
  },

  // ── The factory's today is not UTC's (audit INFRA-H2) ─────────────────────
  //
  // `new Date().toISOString().slice(0,10)` answers YESTERDAY between 00:00 and 05:59 in
  // Dhaka — the night shift, and every nightly cron. Four modules had each written their
  // own Intl workaround; `lib/dates.ts` is that function once. Seeds and tests are exempt:
  // their calendar day carries no meaning, and a fixture is allowed to be arbitrary.
  {
    files: ['src/modules/**/*.ts', 'src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/worker/**/*.ts'],
    ignores: ['**/__tests__/**', 'src/db/seed/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Only the argument-less `new Date()` — "now". Date arithmetic on an explicit
          // UTC-anchored calendar string (`new Date(\`${d}T00:00:00Z\`)`) is timezone-
          // neutral and correct; `lib/dates.ts` does exactly that internally. Banning it
          // too would be telling people off for the right thing.
          selector:
            "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString'][callee.object.callee.object.callee.name='Date'][callee.object.callee.object.arguments.length=0]",
          message:
            "`new Date().toISOString().slice(0,10)` is UTC, and the factory is UTC+6 — it answers yesterday for the whole night shift. Use factoryToday() from @/lib/dates.",
        },
      ],
    },
  },

  // ── CLAUDE.md rule 2 · the query names its company (wall 1) ───────────────
  //
  // An ADOPTION RATCHET, deliberately not a repo-wide rule. Rule 2 says RLS is "the second
  // wall, never the only wall", and it was the only wall: eight incidental company
  // predicates across 466 query sites (audit BE-B1). Converting all of them in one pass
  // would be a mechanical diff across money and payroll that nobody could review honestly.
  //
  // So a file appears here once its queries carry the predicate, and then cannot regress.
  // What is still outside the list is recorded in docs/STUBS.md rather than implied done.
  // 10.1 workforce is first because it is the 🔒 module: a leak here is another factory's
  // wage bill.
  {
    files: ['src/modules/workforce/service.ts', 'src/modules/workforce/queries.ts'],
    rules: { 'fabricxai/require-tenant-predicate': 'error' },
  },

  // ── CLAUDE.md rule 3 · confidence is measured, never typed ────────────────
  //
  // "Confidence is per-field and comes from the extractor — constants are forbidden" had
  // one runtime check behind it, and that check only catches every field scoring the SAME
  // (`assertExtractionConfidence`). Eight modules defeated it with varied per-field
  // constants — `qtyDelta: 0.62`, the same 0.62 on every draft forever — which look more
  // like measurement than a flat 0.8 does, and which drove inbox order, the auto-approve
  // floor and the correction-rate report (audit AI-B2).
  //
  // Repo-wide from the start, not a ratchet: unlike the tenant predicate there was nothing
  // to convert. The eight sites are deleted, and computed confidence — the mock provider's
  // match-quality table, memory's `seededLineConfidence` — was never the target.
  //
  // Tests and seeds are exempt. A fixture's job is to BE a plausible extraction result, and
  // the seeded approve inbox needs a confidence spread or it demonstrates nothing.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', 'src/db/seed/**'],
    rules: { 'fabricxai/no-invented-confidence': 'error' },
  },

  // ── CLAUDE.md rule 9 · analytics is read-only ─────────────────────────────
  //
  // Scoped to what the module SHIPS. Its integration tests have to seed the rows the
  // dashboard then reads — an analytics test that could not write could not test anything —
  // and the guarantee rule 9 makes is about the code that runs in production, not about the
  // fixtures that prove it works.
  {
    files: ['src/modules/analytics/**/*.ts'],
    ignores: ['src/modules/analytics/__tests__/**'],
    rules: { 'fabricxai/analytics-no-writes': 'error' },
  },

  // ── CLAUDE.md rule 1 · actions, routes and components never touch `db` ────
  //
  // The glob used to be `src/app/actions/**` + `src/app/api/**`, which between them held
  // one real file: the sixteen `'use server'` action files live at `src/modules/*/
  // actions.ts` and were never covered (audit BE-H1). Nor was `src/components/`, and that
  // is not hypothetical — the top-bar search shipped as a server action in
  // `src/components/shell/search/` querying six modules' raw schemas, which is exactly
  // what this rule exists to stop, from the one directory nobody had pointed it at.
  {
    files: [
      'src/app/actions/**/*.ts',
      'src/app/api/**/*.ts',
      'src/modules/*/actions.ts',
      'src/components/**/*.{ts,tsx}',
    ],
    ignores: [
      // Better Auth owns its own boundary; the health check deliberately exercises the
      // real pooled path, which is the point of it.
      'src/app/api/auth/**',
      'src/app/api/health/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/db/client',
              message:
                'Actions, route handlers and components are thin: auth → zod → service. All db access lives in modules/<m>/service.ts (CLAUDE.md rule 1).',
            },
          ],
          patterns: [
            {
              // Reaching a table directly is the same violation one level down, and it is
              // the shape both real breaches took: search imported six modules' schemas,
              // and shipment/actions.ts dynamically imported drizzle and its own. Cross-
              // module reads go through the owner's queries.ts (rule 11).
              group: ['@/modules/*/schema', '**/schema', 'drizzle-orm'],
              message:
                'Do not query tables from an action, route or component. Read through the owning module\'s queries.ts (CLAUDE.md rules 1 and 11).',
            },
          ],
        },
      ],
    },
  },

  // k6 scenarios run inside k6's own runtime, not Node: `__ENV`, `__VU` and `__ITER` are
  // injected by it. Declaring them keeps `no-undef` doing its job here rather than being
  // switched off for the whole directory.
  {
    files: ['k6/**/*.js'],
    languageOptions: {
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' },
    },
  },

  // Tests reach into fixtures and raw SQL on purpose.
  {
    files: ['**/__tests__/**/*.ts', 'eslint-rules/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'fabricxai/no-float-money': 'off',
    },
  },
)
