/**
 * 1.3 integration — the two suites that are never skipped for any module (PLAYBOOK §5):
 * cross-company reads return zero rows, and one illegal transition per status field
 * asserts a 409. Plus the breakdown revision rules, which are where the money is.
 *
 * Runs against real Postgres with the application role, so tenancy assertions are real
 * RLS results rather than application-level checks that could be forgotten.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { auditLog, companies, outbox, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import type { RequestCtx, SystemCtx } from '@/modules/core/ctx'
import { AppError } from '@/modules/core/errors'
import { orderBreakdowns, orderRevisions, orderStyles, orders, tnaMilestones, tnaTemplates } from '@/modules/orders/schema'
import {
  actualizeMilestone,
  generateTna,
  previewRipple,
  saveBreakdown,
  setOrderStatus,
} from '@/modules/orders/service'
import { runTnaScan } from '@/modules/orders/jobs'
import { withTenantRead } from '@/modules/core/tenancy'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY_A = randomUUID()
const COMPANY_B = randomUUID()
const USER_A = `ord-a-${randomUUID().slice(0, 8)}`
const USER_B = `ord-b-${randomUUID().slice(0, 8)}`
const BUYER_A = randomUUID()
const TEMPLATE_A = randomUUID()

const ctxA: RequestCtx = { companyId: COMPANY_A, userId: USER_A, roles: ['merchandiser'] }
const ctxB: RequestCtx = { companyId: COMPANY_B, userId: USER_B, roles: ['merchandiser'] }
const systemA: SystemCtx = { companyId: COMPANY_A, userId: null, roles: ['owner'], system: true }

const EX_FACTORY = '2026-06-30'

let orderId: string
let styleId: string

beforeAll(async () => {
  await db
    .insert(companies)
    .values([
      { id: COMPANY_A, name: 'Orders Alpha', slug: `ord-a-${COMPANY_A.slice(0, 8)}` },
      { id: COMPANY_B, name: 'Orders Beta', slug: `ord-b-${COMPANY_B.slice(0, 8)}` },
    ])
    .onConflictDoNothing()

  await db
    .insert(users)
    .values([
      { id: USER_A, email: `${USER_A}@fabricxai.test`, name: 'Alpha Merch' },
      { id: USER_B, email: `${USER_B}@fabricxai.test`, name: 'Beta Merch' },
    ])
    .onConflictDoNothing()

  await db
    .insert(buyers)
    .values({ id: BUYER_A, companyId: COMPANY_A, code: 'HM', name: 'H&M' })
    .onConflictDoNothing()

  await db.insert(tnaTemplates).values({
    id: TEMPLATE_A,
    companyId: COMPANY_A,
    name: 'Knit top 90d',
    productType: 'knit-top',
    milestones: [
      { name: 'fabric_in_house', offsetDaysBeforeExFactory: 60, dependsOn: [], critical: true },
      {
        name: 'cutting_start',
        offsetDaysBeforeExFactory: 45,
        dependsOn: ['fabric_in_house'],
        critical: true,
      },
      {
        name: 'ex_factory',
        offsetDaysBeforeExFactory: 0,
        dependsOn: ['cutting_start'],
        critical: true,
      },
    ],
  })

  const [order] = await db
    .insert(orders)
    .values({
      companyId: COMPANY_A,
      buyerId: BUYER_A,
      poNumbers: ['PO-9931'],
      currency: 'USD',
      qtyTolerancePct: '3.00',
      ownerUserId: USER_A,
      createdBy: USER_A,
    })
    .returning({ id: orders.id })
  orderId = order!.id

  const [style] = await db
    .insert(orderStyles)
    .values({
      companyId: COMPANY_A,
      orderId,
      styleCode: 'ST-100',
      contractedQty: 10_000,
      unitPrice: '4.75',
      currency: 'USD',
    })
    .returning({ id: orderStyles.id })
  styleId = style!.id
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY_A}, ${COMPANY_B})`)
  await db.delete(companies).where(eq(companies.id, COMPANY_A))
  await db.delete(companies).where(eq(companies.id, COMPANY_B))
  await db.delete(users).where(eq(users.id, USER_A))
  await db.delete(users).where(eq(users.id, USER_B))
  await client.end()
})

describe('1.3 · tenancy', () => {
  it('a company cannot read another company’s orders — zero rows, by RLS', async () => {
    const visibleToB = await withTenantRead(ctxB, (tx) =>
      tx.select().from(orders).where(eq(orders.id, orderId)),
    )
    expect(visibleToB).toHaveLength(0)

    const visibleToA = await withTenantRead(ctxA, (tx) =>
      tx.select().from(orders).where(eq(orders.id, orderId)),
    )
    expect(visibleToA).toHaveLength(1)
  })

  it('a cross-company write is refused rather than silently scoped', async () => {
    // Company B tries to touch A's style. Not "forbidden" — invisible.
    await expect(
      saveBreakdown(ctxB, {
        orderStyleId: styleId,
        cells: [{ color: 'Navy', size: 'M', qty: 10_000 }],
        buyerRevision: false,
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('1.3 · breakdown', () => {
  it('accepts a grid that totals within the buyer’s tolerance', async () => {
    const result = await saveBreakdown(ctxA, {
      orderStyleId: styleId,
      cells: [
        { color: 'Navy', size: 'M', qty: 4_000 },
        { color: 'Navy', size: 'L', qty: 3_000 },
        { color: 'Ecru', size: 'M', qty: 3_000 },
      ],
      buyerRevision: false,
    })

    expect(result.totalQty).toBe(10_000)
    expect(result.revision).toBe(1)
    expect(result.isNewRevision).toBe(false)
  })

  it('refuses a grid outside tolerance — that is a claim, not a rounding difference', async () => {
    await expect(
      saveBreakdown(ctxA, {
        orderStyleId: styleId,
        // 3% of 10,000 is 300; 9,000 is far outside it.
        cells: [{ color: 'Navy', size: 'M', qty: 9_000 }],
        buyerRevision: false,
      }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      messageKey: 'orders.errors.breakdown_outside_tolerance',
    })
  })

  it('refuses the same colour/size twice instead of losing one to the unique index', async () => {
    await expect(
      saveBreakdown(ctxA, {
        orderStyleId: styleId,
        cells: [
          { color: 'Navy', size: 'M', qty: 5_000 },
          { color: 'Navy', size: 'M', qty: 5_000 },
        ],
        buyerRevision: false,
      }),
    ).rejects.toMatchObject({ messageKey: 'orders.errors.duplicate_breakdown_cell' })
  })

  it('a correction overwrites the active revision; a buyer change creates a new one', async () => {
    const corrected = await saveBreakdown(ctxA, {
      orderStyleId: styleId,
      cells: [
        { color: 'Navy', size: 'M', qty: 5_000 },
        { color: 'Navy', size: 'L', qty: 5_000 },
      ],
      buyerRevision: false,
    })
    expect(corrected.revision).toBe(1)
    expect(corrected.isNewRevision).toBe(false)

    const revised = await saveBreakdown(ctxA, {
      orderStyleId: styleId,
      cells: [
        { color: 'Navy', size: 'M', qty: 5_100 },
        { color: 'Navy', size: 'L', qty: 4_900 },
      ],
      buyerRevision: true,
      reason: 'Buyer amended the size ratio',
    })
    expect(revised.revision).toBe(2)
    expect(revised.isNewRevision).toBe(true)

    // Revision 1 survives — "what were we cutting to in March" stays answerable.
    const rev1 = await db
      .select()
      .from(orderBreakdowns)
      .where(and(eq(orderBreakdowns.orderStyleId, styleId), eq(orderBreakdowns.revision, 1)))
    expect(rev1).toHaveLength(2)

    const [revisionRow] = await db
      .select()
      .from(orderRevisions)
      .where(and(eq(orderRevisions.orderId, orderId), eq(orderRevisions.revision, 2)))
    expect(revisionRow?.reason).toBe('Buyer amended the size ratio')
    expect(revisionRow?.diff).toMatchObject({ totalBefore: 10_000, totalAfter: 10_000 })
  })
})

describe('1.3 · TNA', () => {
  it('generates the calendar and denormalises ex-factory onto the order', async () => {
    const result = await generateTna(ctxA, {
      orderId,
      templateId: TEMPLATE_A,
      exFactoryDate: EX_FACTORY,
    })

    expect(result.milestones).toHaveLength(3)

    const rows = await db.select().from(tnaMilestones).where(eq(tnaMilestones.orderId, orderId))
    expect(rows).toHaveLength(3)
    expect(rows.find((m) => m.name === 'cutting_start')?.plannedDate).toBe('2026-05-16')

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(order?.plannedExFactoryDate).toBe(EX_FACTORY)
  })

  it('previewRipple writes nothing', async () => {
    const [fabric] = await db
      .select()
      .from(tnaMilestones)
      .where(and(eq(tnaMilestones.orderId, orderId), eq(tnaMilestones.name, 'fabric_in_house')))

    const preview = await previewRipple(ctxA, {
      milestoneId: fabric!.id,
      actualDate: '2026-05-07', // planned 2026-05-01, six days late
    })

    expect(preview.exFactorySlipDays).toBe(6)
    expect(preview.newExFactoryDate).toBe('2026-07-06')

    // The whole point of a preview: nothing changed.
    const [after] = await db.select().from(tnaMilestones).where(eq(tnaMilestones.id, fabric!.id))
    expect(after?.actualDate).toBeNull()
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(order?.plannedExFactoryDate).toBe(EX_FACTORY)
  })

  it('actualizing applies the ripple, moves the ship date, and emits', async () => {
    const [fabric] = await db
      .select()
      .from(tnaMilestones)
      .where(and(eq(tnaMilestones.orderId, orderId), eq(tnaMilestones.name, 'fabric_in_house')))

    const ripple = await actualizeMilestone(ctxA, {
      milestoneId: fabric!.id,
      actualDate: '2026-05-07',
    })
    expect(ripple.exFactorySlipDays).toBe(6)

    const rows = await db.select().from(tnaMilestones).where(eq(tnaMilestones.orderId, orderId))
    expect(rows.find((m) => m.name === 'cutting_start')?.plannedDate).toBe('2026-05-22')
    expect(rows.find((m) => m.name === 'ex_factory')?.plannedDate).toBe('2026-07-06')

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(order?.plannedExFactoryDate).toBe('2026-07-06')

    const events = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.companyId, COMPANY_A), eq(outbox.eventName, 'orders.tna.ex_factory_slipped')))
    expect(events.length).toBeGreaterThan(0)

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, COMPANY_A), eq(auditLog.targetId, orderId)))
    expect(audits.length).toBeGreaterThan(0)
  })

  it('refuses to actualize the same milestone twice', async () => {
    const [fabric] = await db
      .select()
      .from(tnaMilestones)
      .where(and(eq(tnaMilestones.orderId, orderId), eq(tnaMilestones.name, 'fabric_in_house')))

    await expect(
      actualizeMilestone(ctxA, { milestoneId: fabric!.id, actualDate: '2026-05-09' }),
    ).rejects.toMatchObject({ code: 'conflict', status: 409 })
  })

  it('regenerating preserves what already happened', async () => {
    const result = await generateTna(ctxA, {
      orderId,
      templateId: TEMPLATE_A,
      exFactoryDate: '2026-07-15',
    })

    expect(result.preserved).toBe(1)

    const [fabric] = await db
      .select()
      .from(tnaMilestones)
      .where(and(eq(tnaMilestones.orderId, orderId), eq(tnaMilestones.name, 'fabric_in_house')))

    // The recorded actual date survives a template regeneration.
    expect(fabric?.actualDate).toBe('2026-05-07')
  })

  it('the nightly scan derives statuses and is quiet on a second run', async () => {
    const first = await runTnaScan(systemA, { today: '2026-07-14' })
    expect(first.scanned).toBeGreaterThan(0)

    // Nothing changed between runs, so nothing should be re-raised.
    const second = await runTnaScan(systemA, { today: '2026-07-14' })
    expect(second.atRisk).toBe(0)
    expect(second.late).toBe(0)
  })
})

describe('1.3 · order state machine', () => {
  it('walks the legal path', async () => {
    const first = await setOrderStatus(ctxA, { orderId, status: 'in_production' })
    expect(first).toEqual({ from: 'confirmed', to: 'in_production' })

    await setOrderStatus(ctxA, { orderId, status: 'shipped_partial' })
  })

  it('refuses an illegal transition with a 409 listing what IS allowed', async () => {
    // Goods are on a vessel; the order is settled through shipment, not by cancelling.
    const thrown = await setOrderStatus(ctxA, { orderId, status: 'cancelled' }).catch(
      (e: unknown) => e,
    )

    expect(thrown).toBeInstanceOf(AppError)
    const error = thrown as AppError
    expect(error.status).toBe(409)
    expect(error.code).toBe('illegal_transition')
    expect(error.details).toMatchObject({ field: 'status', from: 'shipped_partial', to: 'cancelled' })
    expect(error.details.allowed).toEqual(['shipped_full', 'closed'])
  })

  it('a breakdown edit after production start becomes a revision automatically', async () => {
    // The order is shipped_partial. Even without buyerRevision, this is history now.
    const result = await saveBreakdown(ctxA, {
      orderStyleId: styleId,
      cells: [
        { color: 'Navy', size: 'M', qty: 5_050 },
        { color: 'Navy', size: 'L', qty: 4_950 },
      ],
      buyerRevision: false,
    })

    expect(result.isNewRevision).toBe(true)
    expect(result.revision).toBe(3)
  })
})
