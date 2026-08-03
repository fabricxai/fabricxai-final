/**
 * Company provisioning — what a brand-new factory gets.
 *
 * Three things a fresh tenant cannot function without, and whose absence is confusing
 * rather than obviously missing:
 *
 *  - TNA calendars, or an order has no schedule and 1.4/7.1/8.1 have no dates to watch;
 *  - the loss taxonomy, or `markLost` refuses every code and nobody can record why an
 *    enquiry was lost;
 *  - the defect taxonomy, or inline capture and final inspection refuse every code.
 *
 * What is asserted here: it actually seeds them, re-running is a no-op that does not clobber
 * a factory's customisations, and each module's own operations work immediately afterwards.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import { provisionCompany } from '@/lib/provisioning'
import { buyers } from '@/modules/buyers/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'
import { tnaTemplates } from '@/modules/orders/schema'
import { findTemplateForProductType } from '@/modules/orders/service'
import { defectCodes } from '@/modules/quality/schema'
import { runFinalInspection } from '@/modules/quality/service'
import { lossReasons } from '@/modules/rfq/schema'
import { createRfq, markLost } from '@/modules/rfq/service'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const USER = `prov-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }

beforeAll(async () => {
  await db
    .insert(companies)
    .values({ id: COMPANY, name: 'Fresh Co', slug: `fresh-${COMPANY.slice(0, 8)}` })
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Owner' })
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id = ${COMPANY}`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

describe('provisionCompany', () => {
  it('seeds all three sets and reports what it did', async () => {
    const result = await provisionCompany(ctx)

    expect(result.complete).toBe(true)
    expect(result.steps.map((s) => s.step).sort()).toEqual([
      'orders.tna_templates',
      'quality.defect_codes',
      'rfq.loss_reasons',
    ])
    expect(result.steps.every((s) => s.created > 0)).toBe(true)
  })

  it('is idempotent — a second run creates nothing', async () => {
    const again = await provisionCompany(ctx)

    expect(again.complete).toBe(true)
    // Everything already there. Re-provisioning is safe to run from an admin repair action.
    expect(again.steps.every((s) => s.created === 0)).toBe(true)
    expect(again.steps.every((s) => s.existing > 0)).toBe(true)
  })

  it('does not clobber a template the factory has customised', async () => {
    // Scoped to THIS company on both sides. `db` here is the direct client, which
    // has no RLS session var, so an unscoped write would rename every other
    // tenant's knit template and an unscoped count would tally the whole
    // database — the assertion would then depend on which suites ran first.
    const ours = and(eq(tnaTemplates.companyId, COMPANY), eq(tnaTemplates.productType, 'knit'))

    // A factory that retuned its lead times must not have them overwritten by a re-run.
    await db.update(tnaTemplates).set({ name: 'Knit — OUR tuned 75 day' }).where(ours)

    await provisionCompany(ctx)

    const all = await db.select().from(tnaTemplates).where(ours)
    expect(all[0]!.name).toBe('Knit — OUR tuned 75 day')
    // And there is still exactly one.
    expect(all).toHaveLength(1)
  })
})

describe('what the seeded data actually unblocks', () => {
  it('a merchandiser’s "tee" resolves to a real calendar', async () => {
    const template = await findTemplateForProductType(ctx, { productType: 'tee' })
    expect(template).not.toBeNull()

    const names = (template!.milestones as { name: string }[]).map((m) => m.name)
    // The three names other modules query by.
    expect(names).toContain('cutting')
    expect(names).toContain('final_inspection')
    expect(names).toContain('ex_factory')
  })

  it('an RFQ can be lost, which it could not be before', async () => {
    const [buyer] = await db
      .insert(buyers)
      .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
      .returning({ id: buyers.id })

    const { rfqId } = await createRfq(ctx, {
      buyerId: buyer!.id,
      title: 'Enquiry that went nowhere',
      productType: 'tshirt',
      quantity: 5000,
      currency: 'USD',
    })

    // `markLost` refuses a code that is not in the table. Before provisioning, every code
    // was refused.
    await markLost(ctx, { rfqId, lossReasonCode: 'price' })

    const rows = await db.select().from(lossReasons).where(eq(lossReasons.companyId, COMPANY))
    expect(rows.length).toBeGreaterThanOrEqual(5)
  })

  it('a defect can be recorded, and a needle fails a lot on sight', async () => {
    const codes = await withTenantRead(ctx, async (tx) => tx.select().from(defectCodes))
    expect(codes.length).toBeGreaterThan(10)

    // The severities are what an AQL verdict is computed against. A broken needle
    // classified as major rather than critical would let a lot pass that must fail.
    const needle = codes.find((c) => c.code === 'BROKEN_NEEDLE')!
    expect(needle.severity).toBe('critical')
    expect(codes.find((c) => c.code === 'BROKEN_STITCH')!.severity).toBe('major')
    expect(codes.find((c) => c.code === 'LOOSE_THREAD')!.severity).toBe('minor')
  })

  it('the seeded severities drive a real AQL verdict', async () => {
    const { orders, orderStyles } = await import('@/modules/orders/schema')
    const [buyer] = await db
      .insert(buyers)
      .values({ companyId: COMPANY, code: `B-${randomUUID().slice(0, 6)}`, name: 'Buyer 2' })
      .returning({ id: buyers.id })
    const [order] = await db
      .insert(orders)
      .values({ companyId: COMPANY, buyerId: buyer!.id, poNumbers: ['PO-1'], createdBy: USER })
      .returning({ id: orders.id })
    const [style] = await db
      .insert(orderStyles)
      .values({ companyId: COMPANY, orderId: order!.id, styleCode: 'ST-1', contractedQty: 2000 })
      .returning({ id: orderStyles.id })

    const result = await runFinalInspection(
      ctx,
      {
        orderId: order!.id,
        orderStyleId: style!.id,
        inspectionNo: `FI-${randomUUID().slice(0, 8)}`,
        lotQty: 2000,
        inspectionLevel: 'II',
        majorAql: '2.5',
        minorAql: '4.0',
        // One seeded critical code. There is no acceptance number for it.
        defects: [{ code: 'BROKEN_NEEDLE', count: 1 }],
      },
      { aqlStandard: 'ansi-z1.4', fabricMaxPointsPer100SqYd: '40', repeatDefectDays: 3 },
    )

    expect(result.outcome.verdict).toBe('fail')
    expect(result.outcome.reasons[0]!.code).toBe('critical_defect')
  })
})
