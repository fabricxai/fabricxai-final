/**
 * The `queries.ts` read layers, against a real database.
 *
 * These files are where the frontend work actually went wrong most often, and
 * the failures shared a shape: a derived figure that was plausible but not
 * true. Every case below is one that already bit once —
 *
 *  - a per-DATE map read as a flat daily rate (planning)
 *  - a ratio rendered without its denominator, and an absent one shown as zero
 *    (quality)
 *  - a jsonb entry silently dropped instead of counted (orders)
 *  - a filter that disagreed with the gate it mirrors (procurement, commercial)
 *
 * They run against Postgres rather than mocks because the thing under test IS
 * the query — a mocked row proves the mapping and nothing about the SQL.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, roles, users } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'

import '@/modules/registry'

const RUN = Math.random().toString(36).slice(2, 10)
const client = createDirectClient()
const db = createDirectDb(client)

let ctx: RequestCtx
let companyId: string
let lineId: string
let buyerId: string

beforeAll(async () => {
  const [company] = await db
    .insert(companies)
    .values({ name: `Read Layers ${RUN}`, slug: `read-layers-${RUN}` })
    .returning({ id: companies.id })
  companyId = company!.id

  const userId = `read-layers-${RUN}`
  await db.insert(users).values({ id: userId, email: `${userId}@fabricxai.test`, name: 'Reader' })
  await db.insert(roles).values({ companyId, userId, role: 'owner' })

  ctx = { companyId, userId, roles: ['owner'] }

  // An order cannot exist without a buyer — the schema requires it, which is
  // the right call: an order nobody placed is not an order.
  const { buyers } = await import('@/modules/buyers/schema')
  const [buyer] = await db
    .insert(buyers)
    .values({ companyId, code: `B${RUN.slice(0, 4)}`, name: 'Test Buyer', isActive: true })
    .returning({ id: buyers.id })
  buyerId = buyer!.id

  const { lines } = await import('@/modules/planning/schema')
  const [line] = await db
    .insert(lines)
    .values({ companyId, code: 'L1', name: 'Line 1', isActive: true })
    .returning({ id: lines.id })
  lineId = line!.id
}, 60_000)

afterAll(async () => {
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId))
  await db.delete(users).where(eq(users.id, `read-layers-${RUN}`))
  await client.end()
})

describe('planning: plannedDaily is a per-date map, not a flat rate', () => {
  it('reads each day its own figure', async () => {
    const { allocations, lineCalendars } = await import('@/modules/planning/schema')
    const { board } = await import('@/modules/planning/queries')
    const { orders, orderStyles } = await import('@/modules/orders/schema')

    const [order] = await db
      .insert(orders)
      .values({ companyId, buyerId, poNumbers: [`PO-${RUN}`], currency: 'USD', status: 'confirmed' })
      .returning({ id: orders.id })
    const [style] = await db
      .insert(orderStyles)
      .values({ companyId, orderId: order!.id, styleCode: 'SH-1', currency: 'USD' })
      .returning({ id: orderStyles.id })

    for (const date of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      await db.insert(lineCalendars).values({
        companyId,
        lineId,
        calendarDate: date,
        shiftMinutes: 600,
        plannedDowntimeMinutes: 0,
      })
    }

    // A ramp-up: day one is not day three. Reading this as a flat rate would
    // overstate the opening days and understate the closing ones.
    await db.insert(allocations).values({
      companyId,
      orderId: order!.id,
      orderStyleId: style!.id,
      lineId,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      plannedDaily: { '2026-09-01': 400, '2026-09-02': 700, '2026-09-03': 900 },
      status: 'planned',
      acceptedViolations: [],
    })

    const [row] = await board(ctx, { from: '2026-09-01', days: 3 })
    expect(row).toBeDefined()

    expect(row!.days.map((d) => d.committed)).toEqual([400, 700, 900])
    expect(row!.allocations[0]!.plannedTotal).toBe(2000)
  })

  it('a day with no calendar row has no available minutes', async () => {
    const { board } = await import('@/modules/planning/queries')

    // 2026-09-04 was never given a calendar — the line is closed, which is not
    // the same as working and producing nothing.
    const [row] = await board(ctx, { from: '2026-09-04', days: 1 })
    expect(row!.days[0]!.availableMinutes).toBe(0)
  })
})

describe('quality: a ratio never appears without its denominator', () => {
  it('reports no DHU at all when nothing was checked', async () => {
    const { dhuByLine } = await import('@/modules/quality/queries')

    const rows = await dhuByLine(ctx, { on: '2026-09-20', threshold: '5' })
    const line = rows.find((r) => r.lineId === lineId)!

    // Absence, not zero. A line nobody inspected is not a perfect line.
    expect(line.dhu).toBeNull()
    expect(line.checked).toBe(0)
    expect(line.overThreshold).toBe(false)
  })

  it('computes DHU from the checks and flags the threshold', async () => {
    const { inlineChecks } = await import('@/modules/quality/schema')
    const { dhuByLine } = await import('@/modules/quality/queries')

    await db.insert(inlineChecks).values({
      companyId,
      lineId,
      checkedOn: '2026-09-21',
      occurredAt: new Date('2026-09-21T04:00:00Z'),
      operation: 'side seam',
      checkedQty: 120,
      defects: [{ code: 'SKIP', count: 7 }],
      defectQty: 7,
    })

    const rows = await dhuByLine(ctx, { on: '2026-09-21', threshold: '5' })
    const line = rows.find((r) => r.lineId === lineId)!

    // 7 / 120 * 100
    expect(line.dhu).toBe('5.83')
    expect(line.checked).toBe(120)
    expect(line.overThreshold).toBe(true)
  })
})

describe('orders: a dependency that will not parse is counted, never dropped', () => {
  it('keeps the readable ones and reports the rest', async () => {
    const { orders, orderStyles, tnaMilestones } = await import('@/modules/orders/schema')
    const { orderDetail } = await import('@/modules/orders/queries')

    const [order] = await db
      .insert(orders)
      .values({ companyId, buyerId, poNumbers: [`PO-DEP-${RUN}`], currency: 'USD', status: 'confirmed' })
      .returning({ id: orders.id })
    await db
      .insert(orderStyles)
      .values({ companyId, orderId: order!.id, styleCode: 'SH-DEP', currency: 'USD' })

    await db.insert(tnaMilestones).values({
      companyId,
      orderId: order!.id,
      name: 'cutting',
      plannedDate: '2026-09-10',
      // Both shapes the engine writes, plus one that is malformed.
      dependsOn: [{ name: 'pp_approval', gapDays: 4 }, 'trims_in_house', { gapDays: 9 }],
      critical: true,
      status: 'pending',
    })

    const detail = await orderDetail(ctx, order!.id)
    const milestone = detail!.milestones.find((m) => m.name === 'cutting')!

    expect(milestone.dependsOn.map((d) => d.name)).toEqual(['pp_approval', 'trims_in_house'])
    expect(milestone.dependsOn[0]!.gapDays).toBe(4)
    // The bare-string form carries no gap; null rather than a fabricated zero.
    expect(milestone.dependsOn[1]!.gapDays).toBeNull()
    // The malformed entry is REPORTED, which is the whole point.
    expect(milestone.dependsOnUnreadable).toBe(1)
  })
})

describe('procurement: the BTB rule follows origin, not currency', () => {
  it('flags an import PO with no credit and leaves a local one alone', async () => {
    const { suppliers, supplierPos } = await import('@/modules/procurement/schema')
    const { purchaseOrders } = await import('@/modules/procurement/queries')

    const [importer] = await db
      .insert(suppliers)
      .values({
        companyId,
        code: `IMP${RUN.slice(0, 3)}`,
        name: 'Ningbo Textiles',
        type: 'fabric_mill',
        origin: 'import',
        defaultCurrency: 'USD',
        isActive: true,
      })
      .returning({ id: suppliers.id })

    const [local] = await db
      .insert(suppliers)
      .values({
        companyId,
        code: `LOC${RUN.slice(0, 3)}`,
        // Invoices in USD but is a LOCAL purchase — the case that breaks a
        // currency-based rule.
        name: 'Zaber and Zubair',
        type: 'trims',
        origin: 'local',
        defaultCurrency: 'USD',
        isActive: true,
      })
      .returning({ id: suppliers.id })

    await db.insert(supplierPos).values([
      {
        companyId,
        supplierId: importer!.id,
        poNumber: `FX-IMP-${RUN}`,
        currency: 'USD',
        totalValue: '1000.00',
        status: 'issued',
      },
      {
        companyId,
        supplierId: local!.id,
        poNumber: `FX-LOC-${RUN}`,
        currency: 'USD',
        totalValue: '1000.00',
        status: 'issued',
      },
    ])

    const rows = await purchaseOrders(ctx, { now: new Date('2026-09-01T00:00:00Z') })

    const imported = rows.find((r) => r.poNumber === `FX-IMP-${RUN}`)!
    const localPo = rows.find((r) => r.poNumber === `FX-LOC-${RUN}`)!

    expect(imported.importWithoutBtb).toBe(true)
    // Same currency, same value — only the origin differs.
    expect(localPo.importWithoutBtb).toBe(false)
  })
})

describe('finance: currencies are reported apart, never netted', () => {
  it('returns one position per currency', async () => {
    const { invoices, payables, receivables } = await import('@/modules/finance/schema')
    const { positionByCurrency } = await import('@/modules/finance/queries')
    const { suppliers, supplierPos } = await import('@/modules/procurement/schema')
    const { orders } = await import('@/modules/orders/schema')

    // An invoice always names the order it bills — there is no such thing here
    // as an invoice for nothing in particular.
    const [invoiceOrder] = await db
      .insert(orders)
      .values({ companyId, buyerId, poNumbers: [`PO-FIN-${RUN}`], currency: 'USD', status: 'confirmed' })
      .returning({ id: orders.id })

    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId,
        orderId: invoiceOrder!.id,
        number: `INV-${RUN}`,
        invoiceDate: '2026-09-01',
        value: '5000.00',
        currency: 'USD',
      })
      .returning({ id: invoices.id })

    await db.insert(receivables).values({
      companyId,
      invoiceId: invoice!.id,
      amount: '5000.00',
      currency: 'USD',
      expectedAt: '2026-09-30',
      expectedBasis: { terms: '90d sight' },
      status: 'open',
    })

    const [supplier] = await db
      .insert(suppliers)
      .values({
        companyId,
        code: `PAY${RUN.slice(0, 3)}`,
        name: 'Local trims',
        type: 'trims',
        origin: 'local',
        defaultCurrency: 'BDT',
        isActive: true,
      })
      .returning({ id: suppliers.id })
    const [po] = await db
      .insert(supplierPos)
      .values({
        companyId,
        supplierId: supplier!.id,
        poNumber: `FX-PAY-${RUN}`,
        currency: 'BDT',
        totalValue: '90000.00',
        status: 'issued',
      })
      .returning({ id: supplierPos.id })

    await db.insert(payables).values({
      companyId,
      supplierPoId: po!.id,
      reference: `FX-PAY-${RUN}`,
      amount: '90000.00',
      currency: 'BDT',
      dueAt: '2026-09-15',
      status: 'open',
    })

    const position = await positionByCurrency(ctx)
    const usd = position.find((p) => p.currency === 'USD')!
    const bdt = position.find((p) => p.currency === 'BDT')!

    // Two rows, not one net figure — the net of a USD receivable and a BDT
    // payable is a number in neither currency.
    expect(usd.incoming).toContain('5000')
    expect(usd.outgoing).toBe('0')
    expect(bdt.outgoing).toContain('90000')
    expect(bdt.incoming).toBe('0')
  })
})
