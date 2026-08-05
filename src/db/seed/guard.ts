/**
 * Refuse to fill anything that might be a real factory.
 *
 * `pnpm seed` writes eight users with a published password and `emailVerified` already
 * true. Against a live tenant that is not test data, it is eight open accounts across the
 * role matrix — owner included (audit INFRA-M10).
 *
 * The only guard before this was a silent early return inside `seedCredential()`, which
 * skipped the passwords and let every other slice write. So a seed pointed at production
 * still inserted companies, orders, GRNs and payroll rows into a real factory's tables,
 * and reported success. `docs/runbooks/deploy.md` told operators "the script refuses when
 * NODE_ENV=production" — this is the code that makes that sentence true.
 *
 * Two independent signals, because either alone is easy to get wrong: a machine can have
 * `NODE_ENV` unset and still be pointed at a production database, and a laptop can have
 * `NODE_ENV=production` exported from an earlier experiment while pointed at nothing that
 * matters.
 *
 * Kept in its own module so it can be tested directly — importing the seed's entry point
 * would run `main()` and seed the tester's database.
 */

/**
 * Loopback only.
 *
 * A compose service name (`postgres`, `pgbouncer`) is deliberately NOT treated as local:
 * that is exactly what resolves inside the production stack, so accepting it would disarm
 * the guard in the one place it has to hold. A containerised seed run is a deliberate act
 * and can say so with `SEED_FORCE=1`.
 *
 * Known limitation, stated rather than papered over: an SSH tunnel that publishes a
 * production database on `localhost:5432` looks local to this check and always will. The
 * guard is for the careless invocation, not the determined one.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1'])

export interface SeedTargetEnv {
  NODE_ENV?: string | undefined
  DATABASE_URL?: string | undefined
  DIRECT_DATABASE_URL?: string | undefined
  SEED_FORCE?: string | undefined
}

/** The hostname a connection string points at, or null if it cannot be read as one. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    // URL keeps IPv6 literals in brackets; the allowlist stores them bare.
    return new URL(url).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

/**
 * Every reason this target looks like somewhere real, in the words the operator needs.
 *
 * Returns all of them rather than the first: being told about the host, fixing it, and
 * then being told about `NODE_ENV` is how a safety check trains people to bypass it.
 */
export function seedTargetRefusals(env: SeedTargetEnv): string[] {
  const refusals: string[] = []

  if (env.NODE_ENV === 'production') refusals.push('NODE_ENV=production')

  for (const name of ['DIRECT_DATABASE_URL', 'DATABASE_URL'] as const) {
    const host = hostOf(env[name])
    // Unreadable counts as unsafe. A connection string this cannot parse is one whose
    // target nobody can verify, and the seed is not the place to find out.
    if (host === null) refusals.push(`${name} is missing or is not a URL this can read`)
    else if (!LOOPBACK_HOSTS.has(host)) refusals.push(`${name} points at "${host}", not this machine`)
  }

  return refusals
}

/**
 * Throw unless this database is safe to fill with test data.
 *
 * `SEED_FORCE=1` is the deliberate override — a scratch host, a staging tenant, a run from
 * inside the compose network. It does NOT re-enable the seeded passwords: `seedCredential`
 * refuses those on `NODE_ENV=production` independently, so a forced production run gets
 * rows and no way in.
 */
export function assertSeedTargetIsSafe(
  env: SeedTargetEnv = process.env,
  log: (message: string) => void = console.warn,
): void {
  const refusals = seedTargetRefusals(env)
  if (refusals.length === 0) return

  const listed = refusals.map((r) => `  · ${r}`).join('\n')

  if (env.SEED_FORCE === '1') {
    log(
      `[seed] SEED_FORCE=1 — proceeding against a target that looks real:\n${listed}\n` +
        '[seed] seeded passwords stay refused when NODE_ENV=production.',
    )
    return
  }

  throw new Error(
    `refusing to seed this database:\n${listed}\n\n` +
      'The seed writes users with a published password and emailVerified already true. ' +
      'Against a real tenant that is open accounts, not test data.\n' +
      'If you meant it — scratch host, staging tenant, a run from inside the compose ' +
      'network — set SEED_FORCE=1.',
  )
}
