import js from '@eslint/js'
import next from 'eslint-config-next'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import analyticsNoWrites from './eslint-rules/analytics-no-writes.js'
import noFloatMoney from './eslint-rules/no-float-money.js'

/**
 * The two custom rules below are not style preferences — they are the only automated
 * enforcement behind CLAUDE.md rules 4 and 9. Everything else in this file is
 * conventional; those two are the reason it exists.
 */
const fabricxai = {
  rules: {
    'no-float-money': noFloatMoney,
    'analytics-no-writes': analyticsNoWrites,
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
    files: ['src/modules/**/*.ts', 'src/app/**/*.{ts,tsx}', 'src/db/**/*.ts', 'src/worker/**/*.ts'],
    rules: { 'fabricxai/no-float-money': 'error' },
  },
  {
    // The one file allowed to convert — and only in `format()`, for display. The rule is
    // off here rather than disabled inline so the exemption is visible in one place.
    files: ['src/lib/money.ts'],
    rules: { 'fabricxai/no-float-money': 'off' },
  },

  // ── CLAUDE.md rule 9 · analytics is read-only ─────────────────────────────
  {
    files: ['src/modules/analytics/**/*.ts'],
    rules: { 'fabricxai/analytics-no-writes': 'error' },
  },

  // ── CLAUDE.md rule 1 · actions and routes never touch `db` ────────────────
  {
    files: ['src/app/actions/**/*.ts', 'src/app/api/**/*.ts'],
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
                'Actions and route handlers are thin: auth → zod → service. All db access lives in modules/<m>/service.ts (CLAUDE.md rule 1).',
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
