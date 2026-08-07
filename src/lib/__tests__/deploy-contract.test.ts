/**
 * The contract BETWEEN the deployment files, which no test of any one file could see.
 *
 * Five defects in one week, one shape:
 *
 *   1. compose demanded `SMTP_HOST:?` while env.ts accepts Resend-only — a correct
 *      deployment could not start.
 *   2. `scripts/` was absent from an image whose compose file runs `node scripts/…` — the
 *      first deploy could never have booted.
 *   3. `.env.production.example` shipped an EMAIL_FROM that env.ts's own `z.email()`
 *      rejects — following the example produced "Invalid environment" at boot.
 *   4. `MARBIM_MODEL_EXTRACT` was settable in .env.production and forwarded by nothing —
 *      compose never passed it, so the operator's choice was silently discarded.
 *   5. The Caddyfile's comment required the /s3 prefix be preserved, one line above the
 *      directive that strips it — every upload 403'd.
 *
 * Each file was individually plausible; the lie was in the seams. So this file reads the
 * actual deployment artifacts — docker-compose.prod.yml, .env.production.example — and
 * checks them against the schema the app boots with. It cannot catch everything (nothing
 * here proves the image contains scripts/, or what Caddy does to a path), but the two
 * failure modes it does close are the two that recurred: a variable that exists on one side
 * of the compose boundary and not the other, and an example value the validator refuses.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ENV_FIELDS } from '../env'

const ROOT = join(__dirname, '..', '..', '..')
const compose = readFileSync(join(ROOT, 'docker-compose.prod.yml'), 'utf8')
const example = readFileSync(join(ROOT, '.env.production.example'), 'utf8')

/** The keys compose actually hands the app — the `x-app-env` anchor block, with values. */
function composeAppEnv(): Map<string, string> {
  const start = compose.indexOf('x-app-env:')
  expect(start, 'docker-compose.prod.yml has an x-app-env anchor').toBeGreaterThan(-1)
  const block = compose.slice(start, compose.indexOf('\nx-service', start))
  return new Map(
    [...block.matchAll(/^ {2}([A-Z][A-Z0-9_]*): ?(.*)$/gm)].map((m) => [m[1]!, m[2] ?? '']),
  )
}

const composeAppEnvKeys = (): string[] => [...composeAppEnv().keys()]

/** Every ${VAR} the compose file reads from .env.production, anywhere in the file. */
function composeConsumedVars(): Set<string> {
  return new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:}?]/g)].map((m) => m[1]!))
}

/** KEY= lines in the example, commented or not — a commented key is still documentation. */
function exampleKeys(): { key: string; value: string; commented: boolean }[] {
  return [...example.matchAll(/^(# ?)?([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => ({
    key: m[2]!,
    value: (m[3] ?? '').trim(),
    commented: m[1] !== undefined,
  }))
}

describe('compose ↔ env.ts — the boundary MARBIM_MODEL_EXTRACT fell through', () => {
  /**
   * Variables env.ts reads that compose DELIBERATELY does not pass, each with the reason.
   * An entry here is a decision; a key missing from both this list and the compose block is
   * defect #4 again.
   */
  const DELIBERATELY_NOT_PASSED: Record<string, string> = {
    NODE_ENV: 'compose hardcodes production; an override would be a misconfiguration',
    MARBIM_MOCK: 'dev-only; env.ts refuses it in production, so passing it would be a trap',
  }

  it('1 · every variable the app reads is passed by compose, or its absence is a decision', () => {
    const passed = new Set(composeAppEnvKeys())

    for (const key of Object.keys(ENV_FIELDS)) {
      const ok = passed.has(key) || key in DELIBERATELY_NOT_PASSED
      expect(
        ok,
        `env.ts reads ${key}, but docker-compose.prod.yml's x-app-env does not pass it and ` +
          'no recorded decision excludes it — setting it in .env.production would be ' +
          'silently discarded, which is exactly how MARBIM_MODEL_EXTRACT failed',
      ).toBe(true)
    }
  })

  it('2 · compose passes nothing the app does not read', () => {
    // The reverse direction catches a typo in compose: a misspelt key would be forwarded,
    // read by nothing, and the correctly-spelt variable would fall through to its default.
    for (const key of composeAppEnvKeys()) {
      expect(
        key in ENV_FIELDS,
        `docker-compose.prod.yml passes ${key}, which env.ts does not read — either a typo ` +
          'or a variable that was removed from the schema and not from compose',
      ).toBe(true)
    }
  })

  it('3 · the deliberate omissions are still real keys, so the list cannot rot', () => {
    for (const key of Object.keys(DELIBERATELY_NOT_PASSED)) {
      expect(key in ENV_FIELDS, `${key} is excused from compose but no longer exists`).toBe(true)
    }
  })
})

describe('.env.production.example — the file EMAIL_FROM lied in', () => {
  it('4 · every non-empty example value passes the field schema it will be parsed by', () => {
    /*
     * Defect #3 verbatim: the example shipped `EMAIL_FROM=FabricXAI <no-reply@example.com>`
     * and env.ts validates that field with z.email(), which rejects the display-name form.
     * Anyone following the file got "Invalid environment" at boot. An example whose values
     * do not validate is worse than no example — it is instructions for a failure.
     *
     * Empty values are skipped because env.ts's withoutBlanks strips them before parsing:
     * `KEY=` means "not configured", not "empty string".
     */
    for (const { key, value, commented } of exampleKeys()) {
      if (commented || value === '' || !(key in ENV_FIELDS)) continue

      const result = ENV_FIELDS[key]!.safeParse(value)
      expect(
        result.success,
        `.env.production.example sets ${key}=${value}, which env.ts rejects: ` +
          (result.success ? '' : result.error.issues.map((i) => i.message).join('; ')),
      ).toBe(true)
    }
  })

  it('5 · every example key is read by SOMETHING — the app or the compose file', () => {
    // A key in the example that neither env.ts nor compose consumes is documentation for a
    // variable that does nothing: the operator sets it, nothing changes, and the example
    // taught them it mattered.
    const consumed = composeConsumedVars()

    for (const { key } of exampleKeys()) {
      expect(
        key in ENV_FIELDS || consumed.has(key),
        `.env.production.example documents ${key}, which neither env.ts nor ` +
          'docker-compose.prod.yml reads — setting it does nothing',
      ).toBe(true)
    }
  })

  it('6 · every required variable the OPERATOR supplies appears in the example', () => {
    /*
     * The inverse of 5. A required variable absent from the example is one the operator
     * discovers at boot, from a validation error, on the VPS, instead of while filling in
     * the file at a desk.
     *
     * "Operator-supplied" is read off the compose value: `APP_URL: ${APP_URL:?…}` pulls the
     * key from .env.production, so the operator owns it and the example must show it.
     * `DATABASE_URL: postgres://${APP_DB_USER…}` is CONSTRUCTED by compose — the operator
     * sets APP_DB_PASSWORD (documented, and checked by test 5) and never DATABASE_URL
     * itself, so demanding it in the example would instruct people to set a variable the
     * deployment ignores, which is defect #4 with the files swapped.
     */
    const documented = new Set(exampleKeys().map((entry) => entry.key))
    const appEnv = composeAppEnv()

    for (const [key, field] of Object.entries(ENV_FIELDS)) {
      const required = !field.safeParse(undefined).success
      if (!required) continue

      const composeValue = appEnv.get(key)
      const operatorSupplied = composeValue !== undefined && composeValue.includes('${' + key)
      if (!operatorSupplied) continue

      expect(
        documented.has(key),
        `${key} is required, pulled from .env.production by compose, and absent from ` +
          '.env.production.example — the operator meets it as a boot failure instead of a ' +
          'line in the file',
      ).toBe(true)
    }
  })
})
