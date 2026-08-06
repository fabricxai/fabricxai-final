/**
 * The two tenancy walls fail independently (plan 1.3, audit BE-B1).
 *
 * CLAUDE.md rule 2 says the RLS session variable is "the second wall, never the only wall".
 * It WAS the only wall: across 466 query sites the repo carried eight `company_id`
 * predicates, all incidental.
 *
 * `scoped.ts` argues at length that a predicate in the SQL is a different kind of protection
 * from a policy on the connection — and until now that argument was prose. The adoption note
 * in the plan says it was "verified locally" by disabling RLS by hand, once, on one table.
 * Something checked by hand once is not a property of the system.
 *
 * This is the argument, executed. For each adopted table:
 *
 *  1. two companies, each with a row;
 *  2. RLS is **switched off on that table** — the exact failure the second wall cannot
 *     survive: a table shipped without a policy, a `SET LOCAL` that did not take on a
 *     recycled pooled connection, a future read on an unscoped handle;
 *  3. the unscoped query then returns the OTHER company's row — proving the wall really is
 *     gone, so the next assertion is not passing for some unrelated reason;
 *  4. the scoped query returns nothing, because it names the company in the SQL.
 *
 * Step 3 is what makes step 4 mean anything. Without it a bug that returned zero rows for
 * everybody would read as perfect isolation.
 *
 * ## It runs as the OWNER, deliberately
 *
 * `createDirectClient` is the migration connection, which owns these tables. `ALTER TABLE …
 * DISABLE ROW LEVEL SECURITY` is not something the application role may do, and that is
 * correct — this test is simulating a deployment fault, not exercising a permission.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import type { AnyCtx } from '@/modules/core/ctx'
import { scoped } from '@/modules/core/scoped'
import { uds } from '@/modules/commercial/schema'
import { wageGazettes } from '@/modules/workforce/schema'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY_A = randomUUID()
const COMPANY_B = randomUUID()
const USER = `two-walls-${randomUUID()}`

const ctxA: AnyCtx = { companyId: COMPANY_A, userId: USER, roles: ['owner'] } as AnyCtx

beforeAll(async () => {
  await db.insert(users).values({ id: USER, email: `${USER}@walls.test`, name: 'Walls' })
  await db.insert(companies).values([
    { id: COMPANY_A, name: 'Walls A', slug: `walls-a-${COMPANY_A.slice(0, 8)}` },
    { id: COMPANY_B, name: 'Walls B', slug: `walls-b-${COMPANY_B.slice(0, 8)}` },
  ])

  /*
   * One row each, on a table from each adopted module. B's is the row A must never see.
   *
   * `wage_gazettes` and `uds` because both are insertable from nothing — a fixture needing
   * three parent rows would fail for reasons that have nothing to do with tenancy, and the
   * point here is the predicate rather than the schema.
   */
  await db.insert(wageGazettes).values([
    { companyId: COMPANY_A, version: 'walls-a', effectiveFrom: '2099-01-01', createdBy: USER },
    { companyId: COMPANY_B, version: 'walls-b', effectiveFrom: '2099-01-01', createdBy: USER },
  ])
  await db.insert(uds).values([
    { companyId: COMPANY_A, number: `WALLS-A-${COMPANY_A.slice(0, 6)}`, createdBy: USER },
    { companyId: COMPANY_B, number: `WALLS-B-${COMPANY_B.slice(0, 6)}`, createdBy: USER },
  ])
})

afterAll(async () => {
  // Restore before anything else runs. A suite that left RLS off on a shared database would
  // make every later tenancy test pass for the wrong reason.
  for (const table of ['wage_gazettes', 'uds']) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
    await db.execute(sql.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`))
  }
  await db.delete(companies).where(eq(companies.id, COMPANY_A))
  await db.delete(companies).where(eq(companies.id, COMPANY_B))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

/**
 * Run a read with the tenant session variable set, as a request does — but on the OWNER
 * connection, so RLS being disabled is observable.
 *
 * `withTenantRead` uses the application handle, where the policy would still bind even with
 * `DISABLE` (the owner-facing `FORCE` is what this test removes). Using the owner connection
 * with the same `SET LOCAL` is what isolates the two walls from each other.
 */
async function asCompanyA<T>(run: () => Promise<T>): Promise<T> {
  await db.execute(sql`select set_config('app.company_id', ${COMPANY_A}, false)`)
  return run()
}

describe('wall 2 alone · what happens when RLS is not there', () => {
  it('1 · with RLS off, an unscoped query reads another company’s gazette', async () => {
    /*
     * The failure this whole item exists to make survivable, and it has to be DEMONSTRATED
     * rather than assumed — otherwise the assertion below could pass because the fixture is
     * empty, the ids are wrong, or the query is broken.
     */
    await db.execute(sql.raw('ALTER TABLE wage_gazettes DISABLE ROW LEVEL SECURITY'))

    const rows = await asCompanyA(() =>
      db
        .select({ companyId: wageGazettes.companyId })
        .from(wageGazettes)
        .where(eq(wageGazettes.effectiveFrom, '2099-01-01')),
    )

    const companies = new Set(rows.map((row) => row.companyId))
    expect(companies.has(COMPANY_A), 'own row missing — the fixture is wrong').toBe(true)
    expect(
      companies.has(COMPANY_B),
      'RLS is still binding, so this test proves nothing about wall 1',
    ).toBe(true)
  })

  it('2 · the SAME query, scoped, returns only this company', async () => {
    // Wall 1, on its own, with wall 2 removed. This is the claim `scoped.ts` makes.
    const rows = await asCompanyA(() =>
      db
        .select({ companyId: wageGazettes.companyId })
        .from(wageGazettes)
        .where(scoped(wageGazettes, ctxA, eq(wageGazettes.effectiveFrom, '2099-01-01'))),
    )

    expect(rows.length).toBeGreaterThan(0)
    expect([...new Set(rows.map((row) => row.companyId))]).toEqual([COMPANY_A])
  })

  it('3 · the same holds for an adopted commercial table', async () => {
    // 10.1 workforce was the first module adopted; commercial is the ⚖ one that followed —
    // UDs and LCs, where a wrong row is a customs or a bank problem.
    await db.execute(sql.raw('ALTER TABLE uds DISABLE ROW LEVEL SECURITY'))

    const unscoped = await asCompanyA(() =>
      db.select({ companyId: uds.companyId }).from(uds).where(sql`${uds.number} like 'WALLS-%'`),
    )
    expect(
      new Set(unscoped.map((row) => row.companyId)).size,
      'RLS still binding — the rest of this case proves nothing',
    ).toBe(2)

    const scopedRows = await asCompanyA(() =>
      db
        .select({ companyId: uds.companyId })
        .from(uds)
        .where(scoped(uds, ctxA, sql`${uds.number} like 'WALLS-%'`)),
    )

    expect([...new Set(scopedRows.map((row) => row.companyId))]).toEqual([COMPANY_A])
  })
})
