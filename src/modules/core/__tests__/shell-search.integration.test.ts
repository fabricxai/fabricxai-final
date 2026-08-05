/**
 * The command bar's reads, after they were moved out of the shell (audit BE-H1 / rule 11).
 *
 * `search.ts` shipped importing six modules' raw schemas and querying them itself, from
 * `src/components/` — outside every lint glob that would have objected. The queries now
 * belong to the modules that own those tables, and what stays in the shell is who may see
 * what. These cases cover the seam that move created: each owner's read is scoped, and the
 * shell asks nothing of a module the caller cannot open.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { searchFactory } from '@/components/shell/search/search'
import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, roles, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { searchBuyers } from '@/modules/buyers/queries'
import type { RequestCtx } from '@/modules/core/ctx'

const RUN = Math.random().toString(36).slice(2, 10)
const client = createDirectClient()
const db = createDirectDb(client)

const A = { companyId: crypto.randomUUID(), userId: `search-a-${RUN}` }
const B = { companyId: crypto.randomUUID(), userId: `search-b-${RUN}` }

/** A buyer name distinctive enough that a match can only have come from one company. */
const NEEDLE = `Zephyr${RUN}`

const ctxFor = (f: typeof A): RequestCtx => ({
  companyId: f.companyId,
  userId: f.userId,
  roles: ['merchandiser', 'commercial'],
})

beforeAll(async () => {
  for (const [f, name] of [[A, `srcha${RUN}`], [B, `srchb${RUN}`]] as const) {
    await db.insert(companies).values({ id: f.companyId, name, slug: name })
    await db.insert(users).values({ id: f.userId, email: `${f.userId}@search.test`, name })
    await db.insert(roles).values({ companyId: f.companyId, userId: f.userId, role: 'merchandiser' })
  }
  // Only company A has the buyer.
  await db.insert(buyers).values({ companyId: A.companyId, code: `Z${RUN}`, name: `${NEEDLE} Ltd`, country: 'DE' })
})

afterAll(async () => {
  for (const f of [A, B]) {
    await db.delete(companies).where(eq(companies.id, f.companyId))
    await db.delete(users).where(eq(users.id, f.userId))
  }
  await client.end()
})

describe("the owner's read is scoped", () => {
  it('finds the buyer for the company that owns it', async () => {
    const rows = await searchBuyers(ctxFor(A), { term: NEEDLE, limit: 5 })

    expect(rows.map((r) => r.name)).toContain(`${NEEDLE} Ltd`)
  })

  it('finds nothing for another company searching the same term', async () => {
    const rows = await searchBuyers(ctxFor(B), { term: NEEDLE, limit: 5 })

    expect(rows).toEqual([])
  })
})

describe('the shell decides who may be asked', () => {
  it('returns the record to a role whose nav includes that module', async () => {
    const hits = await searchFactory(ctxFor(A), { query: NEEDLE, factoryType: 'woven' })

    expect(hits.some((h) => h.kind === 'buyer' && h.title === `${NEEDLE} Ltd`)).toBe(true)
  })

  it('asks nothing of a module the caller cannot open', async () => {
    // A storekeeper has no buyers entry in the nav, so the buyer desk is never queried —
    // the same predicate the sidebar uses, applied before the read rather than after it.
    const storekeeper: RequestCtx = { ...ctxFor(A), roles: ['store'] }
    const hits = await searchFactory(storekeeper, { query: NEEDLE, factoryType: 'woven' })

    expect(hits.some((h) => h.kind === 'buyer')).toBe(false)
  })

  it('refuses to fan out below the minimum length', async () => {
    // One character was six unanchored ILIKE scans per debounced keystroke.
    for (const query of ['Z', 'Ze']) {
      expect(await searchFactory(ctxFor(A), { query, factoryType: 'woven' }), query).toEqual([])
    }
  })

  it('still answers module names, which is what the bar is mostly used for', async () => {
    const hits = await searchFactory(ctxFor(A), { query: 'cost', factoryType: 'woven' })

    expect(hits.some((h) => h.kind === 'module' && h.href === '/costing')).toBe(true)
  })
})
