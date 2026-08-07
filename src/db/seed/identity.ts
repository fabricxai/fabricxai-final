/**
 * Who the seed creates, and at what address — in ONE place.
 *
 * This file exists because the definition drifted and nothing caught it. The seed moved to
 * tenant-scoped addresses (`owner+00000000@…`) so it could fill more than one company;
 * `users.email` is unique across the whole install, so a fixed address meant the second
 * company died on a duplicate key halfway through. The e2e suite, written three days later,
 * kept signing in as the unscoped `owner@seed-apparels.test`.
 *
 * Nothing failed locally, because a developer's database still held rows from before the
 * change. On a fresh database — which is what CI builds every run — every sign-in failed
 * with "That email and password did not match", and the suite reported the login form
 * broken when the addresses were simply wrong.
 *
 * So: one definition, imported by the seed and by the tests that sign in as it. A constant
 * copied into two files is a constant that will disagree with itself.
 */

/**
 * The seed's own company.
 *
 * Fixed rather than random so the addresses below are derivable without a database lookup —
 * which is what lets the e2e suite know who to sign in as before it has connected to
 * anything.
 */
export const SEED_COMPANY_ID = '00000000-0000-4000-8000-000000000001'

export const SEED_COMPANY_SLUG = 'seed-apparels'

/**
 * The password every seeded person shares.
 *
 * Identical for everybody on purpose — switching roles during a walkthrough should not mean
 * looking up eight passwords. Long enough for `minPasswordLength: 10`.
 *
 * Never reaches production: `seedCredential` refuses to write a credential row at all when
 * `NODE_ENV=production`, so a seed run against a live tenant cannot open this hole.
 */
export const SEED_PASSWORD = 'FabricXai-seed-2026'

/**
 * The address a seeded person signs in with.
 *
 * Scoped to the tenant, like their row id already was. `companyId` is a parameter rather
 * than a constant read because `SEED_COMPANY_ID` can be overridden to fill somebody else's
 * company — the addresses have to follow that, not the default.
 */
export function seedEmail(personKey: string, companyId: string = SEED_COMPANY_ID): string {
  return `${personKey}+${companyId.slice(0, 8)}@seed-apparels.test`
}
