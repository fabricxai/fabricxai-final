/**
 * The seed's refusal to fill a real factory (audit INFRA-M10).
 *
 * Worth testing rather than eyeballing: the failure it prevents is silent and permanent.
 * The predecessor guard skipped the passwords and let every other slice write, so a seed
 * pointed at production inserted rows into a live factory and reported success.
 */
import { describe, expect, it } from 'vitest'

import { assertSeedTargetIsSafe, seedTargetRefusals } from '../guard'

const LOCAL = {
  NODE_ENV: 'development',
  DIRECT_DATABASE_URL: 'postgres://fabricxai:fabricxai@localhost:5433/fabricxai',
  DATABASE_URL: 'postgres://fabricxai_app_rw:secret@localhost:6432/fabricxai',
}

describe('a local target is allowed through', () => {
  it('accepts the dev setup from .env.example', () => {
    expect(seedTargetRefusals(LOCAL)).toEqual([])
    expect(() => assertSeedTargetIsSafe(LOCAL)).not.toThrow()
  })

  it('accepts what CI runs, which is the same hosts on 5432', () => {
    expect(
      seedTargetRefusals({
        NODE_ENV: 'test',
        DIRECT_DATABASE_URL: 'postgres://fabricxai:fabricxai@localhost:5432/fabricxai',
        DATABASE_URL: 'postgres://fabricxai_app_rw:ci-secret@localhost:5432/fabricxai',
      }),
    ).toEqual([])
  })

  it('accepts loopback by address, v4 and v6', () => {
    for (const host of ['127.0.0.1', '[::1]']) {
      expect(
        seedTargetRefusals({
          ...LOCAL,
          DIRECT_DATABASE_URL: `postgres://u:p@${host}:5433/fabricxai`,
        }),
        host,
      ).toEqual([])
    }
  })
})

describe('anything that might be real is refused', () => {
  it('refuses NODE_ENV=production even on a local database', () => {
    const refusals = seedTargetRefusals({ ...LOCAL, NODE_ENV: 'production' })

    expect(refusals).toEqual(['NODE_ENV=production'])
    expect(() => assertSeedTargetIsSafe({ ...LOCAL, NODE_ENV: 'production' })).toThrow(
      /refusing to seed/,
    )
  })

  it('refuses a remote host even with NODE_ENV unset', () => {
    // The case a NODE_ENV check alone misses: a laptop pointed at a real database.
    const env = {
      DIRECT_DATABASE_URL: 'postgres://u:p@db.factory.example.com:5432/fabricxai',
      DATABASE_URL: 'postgres://u:p@db.factory.example.com:6432/fabricxai',
    }

    expect(seedTargetRefusals(env)).toHaveLength(2)
    expect(() => assertSeedTargetIsSafe(env)).toThrow(/db\.factory\.example\.com/)
  })

  it('refuses compose service names, which is what production resolves', () => {
    // Accepting these would disarm the guard in the exact place it has to hold.
    for (const host of ['postgres', 'pgbouncer']) {
      expect(
        seedTargetRefusals({ ...LOCAL, DIRECT_DATABASE_URL: `postgres://u:p@${host}:5432/x` }),
        host,
      ).toEqual([`DIRECT_DATABASE_URL points at "${host}", not this machine`])
    }
  })

  it('refuses a missing or unreadable connection string', () => {
    // Unverifiable is not the same as safe.
    expect(seedTargetRefusals({ ...LOCAL, DATABASE_URL: undefined })).toEqual([
      'DATABASE_URL is missing or is not a URL this can read',
    ])
    expect(seedTargetRefusals({ ...LOCAL, DATABASE_URL: 'not-a-url' })).toHaveLength(1)
  })

  it('reports every reason at once', () => {
    // Being told one thing, fixing it, and being told the next is how a safety check
    // teaches people to reach for the override.
    const refusals = seedTargetRefusals({
      NODE_ENV: 'production',
      DIRECT_DATABASE_URL: 'postgres://u:p@db.example.com:5432/x',
      DATABASE_URL: 'postgres://u:p@db.example.com:6432/x',
    })

    expect(refusals).toHaveLength(3)
  })

  it('names the password in the refusal, so the stakes are on screen', () => {
    expect(() => assertSeedTargetIsSafe({ ...LOCAL, NODE_ENV: 'production' })).toThrow(
      /published password/,
    )
  })
})

describe('SEED_FORCE is the deliberate override', () => {
  it('proceeds, and says what it is proceeding against', () => {
    const warnings: string[] = []
    const env = { ...LOCAL, NODE_ENV: 'production', SEED_FORCE: '1' }

    expect(() => assertSeedTargetIsSafe(env, (m) => warnings.push(m))).not.toThrow()
    expect(warnings.join('\n')).toContain('NODE_ENV=production')
  })

  it('promises no passwords on a forced production run', () => {
    // `seedCredential` refuses independently of this flag; the warning must not imply
    // otherwise, because that is the sentence somebody will rely on.
    const warnings: string[] = []
    assertSeedTargetIsSafe({ ...LOCAL, NODE_ENV: 'production', SEED_FORCE: '1' }, (m) =>
      warnings.push(m),
    )

    expect(warnings.join('\n')).toMatch(/passwords stay refused/)
  })

  it('is not triggered by a stray truthy value', () => {
    // Only '1'. "true", "yes" or a leftover empty string must not disarm it.
    for (const value of ['true', 'yes', '0', '']) {
      expect(
        () => assertSeedTargetIsSafe({ ...LOCAL, NODE_ENV: 'production', SEED_FORCE: value }),
        value,
      ).toThrow()
    }
  })
})
