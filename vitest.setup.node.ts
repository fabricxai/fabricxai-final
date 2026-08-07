/**
 * Placeholder environment for the unit suite.
 *
 * The unit project is "pure logic only, no database" — but five test files reach modules
 * that transitively import `src/db/client.ts`, which imports `src/lib/env.ts`, which
 * validates the WHOLE environment at module load and throws. That is the intended design
 * for the app and the worker: a misconfigured deployment dies at startup.
 *
 * It meant the suite passed only where a `.env` happened to exist. Vitest loads one through
 * Vite, `.env` is gitignored, and CI has none — so those five files failed to import in CI
 * and 72 tests never ran, while the same command was green on every developer's machine.
 * A fresh clone could not run `pnpm test` either.
 *
 * Filled here rather than in each test because it is not a fact any test is about. Only
 * ABSENT keys are set, so a real `.env` still wins and the integration project — which needs
 * these to point at something real — is unaffected.
 *
 * These values are deliberately unreachable. Nothing in the unit project opens a connection
 * (`db/client.ts` is lazy for exactly this reason); if something ever does, a refused
 * connection to a bogus host is the failure you want, rather than a silent write to whatever
 * happened to be in the shell.
 */
const PLACEHOLDERS: Record<string, string> = {
  APP_URL: 'http://unit.invalid',
  DATABASE_URL: 'postgres://unit:unit@unit.invalid:5432/unit',
  DIRECT_DATABASE_URL: 'postgres://unit:unit@unit.invalid:5432/unit',
  REDIS_URL: 'redis://unit.invalid:6379',
  BETTER_AUTH_SECRET: 'unit-tests-only-secret-0123456789abcdef',
  S3_ENDPOINT: 'http://unit.invalid:9000',
  S3_ACCESS_KEY_ID: 'unit',
  S3_SECRET_ACCESS_KEY: 'unit',
  S3_BUCKET: 'unit',
}

for (const [key, value] of Object.entries(PLACEHOLDERS)) {
  if (process.env[key] === undefined || process.env[key]?.trim() === '') {
    process.env[key] = value
  }
}
