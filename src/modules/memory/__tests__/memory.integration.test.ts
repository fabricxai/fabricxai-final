/**
 * 1.6 integration.
 *
 * The pure rules are covered by `memory.test.ts`. What is asserted here is the pipeline and,
 * more importantly, the refusals — because everything this module produces looks like a
 * measurement, and a merchandiser will price against it without re-deriving anything:
 *
 *  - a compiled outcome divides by pieces SHIPPED, not by the contracted quantity;
 *  - `compiledSources` distinguishes "no defects" from "nobody was recording defects";
 *  - a second `orders.closed` recompiles rather than filing a competing account, and does
 *    not touch the merchandiser's note;
 *  - the note closes after seven days and nothing else on the row can ever be edited;
 *  - seeding refuses an order whose outcome was never compiled, and marks every line
 *    measured or carried-over;
 *  - similarity never compares vectors from two different models;
 *  - cross-company reads see nothing.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, pendingChanges, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { bomLines, boms } from '@/modules/costing/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { approve } from '@/modules/core/pending-changes'
import '@/modules/costing/register'
import { mockProvider } from '@/modules/marbim/mock-provider'
import { registerProvider, resetProvider } from '@/modules/marbim/provider'
import '@/modules/marbim/register'
import '@/modules/memory/register'
import { orderOutcomes, styleFingerprints } from '@/modules/memory/schema'
import {
  compileOutcome,
  embedStyle,
  findSimilar,
  outcomeFor,
  seedCostSheet,
  setOutcomeNote,
} from '@/modules/memory/service'
import { orderStyles, orders } from '@/modules/orders/schema'
import { lines } from '@/modules/planning/schema'
import { allocations } from '@/modules/planning/schema'
import { efficiencyDaily } from '@/modules/production/schema'
import { inlineChecks } from '@/modules/quality/schema'
import { rfqs } from '@/modules/rfq/schema'
import '@/modules/rfq/register'
import { cartons, shipments } from '@/modules/shipment/schema'
import { issueLines, issues, items } from '@/modules/store/schema'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const USER = `mem-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['merchandiser'] }
const ownerCtx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: USER, roles: ['merchandiser'] }

let orderId: string
let buyerId: string
let lineId: string
let fabricItemId: string

/** The order the whole suite compiles: 12,000 contracted, 10,000 actually shipped. */
const CONTRACTED = 12_000
const SHIPPED = 10_000

beforeAll(async () => {
  registerProvider(mockProvider)

  await db.insert(companies).values([
    { id: COMPANY, name: 'Memory Co', slug: `mem-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Merch' })

  const [buyer] = await db
    .insert(buyers)
    .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
    .returning({ id: buyers.id })
  buyerId = buyer!.id

  const [order] = await db
    .insert(orders)
    .values({
      companyId: COMPANY,
      buyerId,
      poNumbers: ['PO-MEM-1'],
      currency: 'USD',
      plannedExFactoryDate: '2026-04-30',
      ownerUserId: USER,
      status: 'closed',
    })
    .returning({ id: orders.id })
  orderId = order!.id

  await db.insert(orderStyles).values({
    companyId: COMPANY,
    orderId,
    styleCode: 'TS-100',
    contractedQty: CONTRACTED,
    unitPrice: '4.50',
    currency: 'USD',
  })

  // ── what actually shipped: cartons loaded onto a shipment ──
  const [shipment] = await db
    .insert(shipments)
    .values({
      companyId: COMPANY,
      orderId,
      partialNo: 1,
      plannedExFactory: '2026-04-30',
      actualExFactory: '2026-04-29',
      expNumber: 'EXP-2026-0001',
    })
    .returning({ id: shipments.id })

  await db.insert(cartons).values([
    {
      companyId: COMPANY,
      orderId,
      shipmentId: shipment!.id,
      cartonNo: `C-${COMPANY.slice(0, 6)}-1`,
      totalQty: 6_000,
    },
    {
      companyId: COMPANY,
      orderId,
      shipmentId: shipment!.id,
      cartonNo: `C-${COMPANY.slice(0, 6)}-2`,
      totalQty: 4_000,
    },
    // Never loaded — still sitting in the finishing store, so not shipped.
    {
      companyId: COMPANY,
      orderId,
      cartonNo: `C-${COMPANY.slice(0, 6)}-3`,
      totalQty: 2_000,
    },
  ])

  // ── what it consumed: 15,000 m issued against the order ──
  const [item] = await db
    .insert(items)
    .values({
      companyId: COMPANY,
      code: 'FAB-JERSEY-180',
      kind: 'fabric',
      name: 'Single jersey 180gsm',
      uom: 'm',
    })
    .returning({ id: items.id })
  fabricItemId = item!.id

  const [issue] = await db
    .insert(issues)
    .values({ companyId: COMPANY, orderId, createdBy: USER })
    .returning({ id: issues.id })

  await db.insert(issueLines).values([
    { companyId: COMPANY, issueId: issue!.id, itemId: fabricItemId, qty: '9000.00', unit: 'm' },
    { companyId: COMPANY, issueId: issue!.id, itemId: fabricItemId, qty: '6000.00', unit: 'm' },
  ])

  // ── the line it ran on, and the efficiency of those days ──
  const [line] = await db
    .insert(lines)
    .values({ companyId: COMPANY, code: 'L1', name: 'Line 1', capacityManpower: 40 })
    .returning({ id: lines.id })
  lineId = line!.id

  await db.insert(allocations).values({
    companyId: COMPANY,
    orderId,
    lineId,
    startDate: '2026-03-01',
    endDate: '2026-03-02',
  })

  await db.insert(efficiencyDaily).values([
    {
      companyId: COMPANY,
      lineId,
      forDate: '2026-03-01',
      earnedMinutes: '12000.00',
      availableMinutes: '19200.00',
      efficiencyPct: '62.50',
      outputTotal: 5_000,
    },
    {
      companyId: COMPANY,
      lineId,
      forDate: '2026-03-02',
      earnedMinutes: '13632.00',
      availableMinutes: '19200.00',
      efficiencyPct: '71.00',
      outputTotal: 5_000,
    },
  ])
})

afterAll(async () => {
  resetProvider()
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

describe('1.6 · compiling what happened', () => {
  it('divides consumption by pieces SHIPPED, not by what the buyer contracted', async () => {
    const compiled = await compileOutcome(ctx, { orderId })

    // 10,000 loaded; the 2,000 still in the finishing store did not ship.
    expect(compiled.piecesProduced).toBe(SHIPPED)

    const outcome = await outcomeFor(ctx, orderId)
    const consumption = outcome!.actualConsumptionPc as {
      itemRef: string
      perPiece: string
      piecesProduced: number
    }[]

    // 15,000 m over 10,000 pieces. Against the contracted 12,000 it would read 1.25 — the
    // order shipped short, and pretending otherwise makes this the cheapest style the
    // factory has ever made.
    expect(consumption).toHaveLength(1)
    expect(consumption[0]!.itemRef).toBe('FAB-JERSEY-180')
    expect(consumption[0]!.perPiece).toBe('1.5000')
    expect(consumption[0]!.piecesProduced).toBe(SHIPPED)
  })

  it('records which sources had data, so an empty list is not read as a clean order', async () => {
    await compileOutcome(ctx, { orderId })
    const outcome = await outcomeFor(ctx, orderId)
    const sources = outcome!.compiledSources

    expect(sources.consumption).toBe(true)
    expect(sources.efficiency).toBe(true)
    // Nothing was ever recorded against this order in 7.1 or 11.1. That is a gap in the
    // record, and the flag is the only thing that stops it reading as "no defects, and we
    // do not know the margin because there was not one".
    expect(sources.defects).toBe(false)
    expect(sources.margins).toBe(false)
    expect(outcome!.topDefects).toEqual([])
    expect(outcome!.actualMarginPct).toBeNull()
  })

  it('carries the efficiency curve with the shared-day flag', async () => {
    await compileOutcome(ctx, { orderId })
    const outcome = await outcomeFor(ctx, orderId)
    const curve = outcome!.efficiencyCurve as {
      date: string
      efficiencyPct: string
      sharedWithOtherOrders: boolean
    }[]

    expect(curve).toHaveLength(2)
    expect(curve[0]!.date).toBe('2026-03-01')
    expect(curve[0]!.efficiencyPct).toBe('62.50')
    // Only this order was allocated to L1 on those dates.
    expect(curve.every((d) => !d.sharedWithOtherOrders)).toBe(true)
  })

  it('FLAGS a day the line also ran another order', async () => {
    // A second order on the same line, overlapping the second day.
    const [other] = await db
      .insert(orders)
      .values({
        companyId: COMPANY,
        buyerId,
        poNumbers: [`PO-MEM-SHARED-${randomUUID().slice(0, 6)}`],
        currency: 'USD',
        plannedExFactoryDate: '2026-05-30',
      })
      .returning({ id: orders.id })

    await db.insert(allocations).values({
      companyId: COMPANY,
      orderId: other!.id,
      lineId,
      startDate: '2026-03-02',
      endDate: '2026-03-02',
    })

    try {
      await compileOutcome(ctx, { orderId })
      const outcome = await outcomeFor(ctx, orderId)
      const curve = outcome!.efficiencyCurve as {
        date: string
        efficiencyPct: string
        sharedWithOtherOrders: boolean
      }[]

      const shared = curve.find((d) => d.date === '2026-03-02')!
      expect(shared.sharedWithOtherOrders).toBe(true)
      // Reported, not halved. There is no record of the split.
      expect(shared.efficiencyPct).toBe('71.00')
      expect(curve.find((d) => d.date === '2026-03-01')!.sharedWithOtherOrders).toBe(false)
    } finally {
      await db.delete(orders).where(eq(orders.id, other!.id))
      await compileOutcome(ctx, { orderId })
    }
  })

  it('a redelivered close recompiles the same row and leaves the note alone', async () => {
    await compileOutcome(ctx, { orderId })
    await setOutcomeNote(ctx, { orderId, merchandiserNote: 'Fabric landed 14 days late.' })

    await compileOutcome(ctx, { orderId })

    const rows = await db.select().from(orderOutcomes).where(eq(orderOutcomes.orderId, orderId))
    // One account of one order, not two competing ones.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.merchandiserNote).toBe('Fabric landed 14 days late.')
  })

  it('refuses to compile another company’s order', async () => {
    await expect(compileOutcome(otherCtx, { orderId })).rejects.toMatchObject({
      messageKey: 'memory.errors.order_not_found',
    })
  })
})

describe('1.6 · the outcome is a record', () => {
  it('accepts the note inside the seven-day window', async () => {
    await compileOutcome(ctx, { orderId })
    await setOutcomeNote(ctx, { orderId, merchandiserNote: 'Buyer changed the trim twice.' })

    const outcome = await outcomeFor(ctx, orderId)
    expect(outcome!.merchandiserNote).toBe('Buyer changed the trim twice.')
    expect(outcome!.noteUpdatedBy).toBe(USER)
  })

  it('REFUSES the note once the window has closed', async () => {
    await compileOutcome(ctx, { orderId })
    const outcome = await outcomeFor(ctx, orderId)

    const eightDaysLater = new Date(outcome!.compiledAt.getTime() + 8 * 86_400_000)

    // Written while it is remembered, and closed before it becomes a place to revise history
    // around an awkward margin.
    await expect(
      setOutcomeNote(ctx, { orderId, merchandiserNote: 'On reflection…' }, eightDaysLater),
    ).rejects.toMatchObject({ messageKey: 'memory.errors.note_window_closed' })
  })

  it('another company cannot read or annotate this outcome', async () => {
    await compileOutcome(ctx, { orderId })

    expect(await outcomeFor(otherCtx, orderId)).toBeNull()
    await expect(
      setOutcomeNote(otherCtx, { orderId, merchandiserNote: 'x' }),
    ).rejects.toMatchObject({ messageKey: 'memory.errors.outcome_not_found' })
  })
})

describe('1.6 · similarity', () => {
  it('embeds a style once and skips the model call when nothing changed', async () => {
    const first = await embedStyle(ctx, {
      styleCode: 'TS-100',
      attrs: { productType: 'tshirt', gsm: 180, construction: 'single jersey' },
    })
    expect(first.embedded).toBe(true)

    const again = await embedStyle(ctx, {
      // Same attributes, different key order — the fingerprint text is the same.
      styleCode: 'TS-100',
      attrs: { construction: 'single jersey', gsm: 180, productType: 'tshirt' },
    })
    expect(again.embedded).toBe(false)
    expect(again.fingerprintId).toBe(first.fingerprintId)
  })

  it('re-embeds when an attribute actually changes', async () => {
    await embedStyle(ctx, { styleCode: 'TS-200', attrs: { productType: 'tshirt', gsm: 160 } })
    const changed = await embedStyle(ctx, {
      styleCode: 'TS-200',
      attrs: { productType: 'tshirt', gsm: 200 },
    })
    expect(changed.embedded).toBe(true)
  })

  it('ranks a genuinely similar style above an unrelated one', async () => {
    await embedStyle(ctx, {
      styleCode: 'TS-100',
      attrs: { productType: 'tshirt', gsm: 180, construction: 'single jersey' },
    })
    await embedStyle(ctx, {
      styleCode: 'TS-101',
      attrs: { productType: 'tshirt', gsm: 180, construction: 'single jersey' },
    })
    await embedStyle(ctx, {
      styleCode: 'JKT-900',
      attrs: { productType: 'jacket', gsm: 400, construction: 'woven twill' },
    })

    const matches = await findSimilar(ctx, {
      attrs: { productType: 'tshirt', gsm: 180, construction: 'single jersey' },
      k: 3,
    })

    expect(matches[0]!.styleCode).toMatch(/^TS-10/)
    const jacket = matches.find((m) => m.styleCode === 'JKT-900')
    // Whether the jacket makes the top 3 or not, it must never outrank a matching tee.
    if (jacket) expect(Number(jacket.matchPct)).toBeLessThan(Number(matches[0]!.matchPct))
  })

  it('attaches the compiled outcome to a match that has one', async () => {
    await compileOutcome(ctx, { orderId })
    await embedStyle(ctx, { styleCode: 'TS-100', attrs: { productType: 'tshirt', gsm: 180 } })

    const matches = await findSimilar(ctx, { attrs: { productType: 'tshirt', gsm: 180 }, k: 5 })
    const withOutcome = matches.find((m) => m.styleCode === 'TS-100')

    expect(withOutcome!.outcome).not.toBeNull()
    expect(withOutcome!.outcome!.piecesProduced).toBe(SHIPPED)
  })

  it('NEVER compares vectors from two different models', async () => {
    await embedStyle(ctx, { styleCode: 'TS-100', attrs: { productType: 'tshirt', gsm: 180 } })

    // The same style, fingerprinted by a different model. Its vector lives in a different
    // space, so a distance against it is a number with no meaning at all.
    await db
      .update(styleFingerprints)
      .set({ model: 'some-other-model/v9' })
      .where(eq(styleFingerprints.styleCode, 'TS-100'))

    try {
      const matches = await findSimilar(ctx, { attrs: { productType: 'tshirt', gsm: 180 }, k: 5 })
      expect(matches.map((m) => m.styleCode)).not.toContain('TS-100')
    } finally {
      await embedStyle(ctx, { styleCode: 'TS-100', attrs: { productType: 'tshirt', gsm: 180 } })
    }
  })

  it('refuses to match against a style that was never fingerprinted', async () => {
    // Quietly embedding it here would hide a broken job queue behind results that look fine.
    await expect(findSimilar(ctx, { styleCode: 'NEVER-SEEN', k: 3 })).rejects.toMatchObject({
      messageKey: 'memory.errors.no_fingerprint',
    })
  })

  it('another company’s fingerprints are invisible', async () => {
    await embedStyle(ctx, { styleCode: 'TS-100', attrs: { productType: 'tshirt', gsm: 180 } })
    const mine = await db
      .select()
      .from(styleFingerprints)
      .where(eq(styleFingerprints.companyId, COMPANY))
    expect(mine.length).toBeGreaterThan(0)

    await expect(findSimilar(otherCtx, { styleCode: 'TS-100', k: 3 })).rejects.toMatchObject({
      messageKey: 'memory.errors.no_fingerprint',
    })
  })
})

describe('1.6 · seeding the next quote', () => {
  let sourceBomId: string
  let rfqId: string

  beforeAll(async () => {
    const [bom] = await db
      .insert(boms)
      .values({ companyId: COMPANY, styleCode: 'TS-100', source: 'tech_pack_extract' })
      .returning({ id: boms.id })
    sourceBomId = bom!.id

    await db.insert(bomLines).values([
      {
        companyId: COMPANY,
        bomId: sourceBomId,
        lineGroup: 'fabric',
        itemRef: 'FAB-JERSEY-180',
        // The tech pack's ESTIMATE. The order actually used 1.5.
        consumption: '1.3000',
        uom: 'm',
        wastagePct: '5',
      },
      {
        companyId: COMPANY,
        bomId: sourceBomId,
        lineGroup: 'trims',
        itemRef: 'TRM-LABEL-01',
        consumption: '1.0000',
        uom: 'pcs',
        wastagePct: '2',
      },
    ])

    const [rfq] = await db
      .insert(rfqs)
      .values({
        companyId: COMPANY,
        buyerId,
        title: 'Basic crew tee, repeat',
        productType: 'tshirt',
        styleCode: 'TS-300',
        quantity: 8_000,
        unit: 'pcs',
        currency: 'USD',
        source: 'manual',
        createdBy: USER,
      })
      .returning({ id: rfqs.id })
    rfqId = rfq!.id
  })

  it('drafts a BOM whose measured line carries the ACTUAL consumption', async () => {
    await compileOutcome(ctx, { orderId })

    const seeded = await seedCostSheet(ctx, { fromOrderId: orderId, targetRfqId: rfqId })

    expect(seeded.measuredLines).toBe(1)
    // Nothing was issued against the label, so its figure is the old estimate — carried
    // across so the BOM keeps its shape, and labelled as what it is.
    expect(seeded.plannedLines).toBe(1)

    const [draft] = await db
      .select()
      .from(pendingChanges)
      .where(eq(pendingChanges.id, seeded.pendingChangeId))

    const payload = draft!.payload as {
      styleCode: string
      fromOrderId: string
      lines: { itemRef: string; consumption: string; consumptionBasis: string }[]
    }

    // The RFQ's own style code — this BOM is for the new enquiry, not a copy of the old one.
    expect(payload.styleCode).toBe('TS-300')
    expect(payload.fromOrderId).toBe(orderId)

    const fabric = payload.lines.find((l) => l.itemRef === 'FAB-JERSEY-180')!
    expect(fabric.consumption).toBe('1.5000')
    expect(fabric.consumptionBasis).toBe('actual')

    const trim = payload.lines.find((l) => l.itemRef === 'TRM-LABEL-01')!
    expect(trim.consumption).toBe('1.0000')
    expect(trim.consumptionBasis).toBe('planned')
  })

  it('scores the measured line above the carried-over one', async () => {
    await compileOutcome(ctx, { orderId })
    const seeded = await seedCostSheet(ctx, { fromOrderId: orderId, targetRfqId: rfqId })

    const [draft] = await db
      .select()
      .from(pendingChanges)
      .where(eq(pendingChanges.id, seeded.pendingChangeId))

    const confidence = draft!.fieldConfidence as Record<string, number>
    const payload = draft!.payload as { lines: { consumptionBasis: string }[] }

    const measuredIndex = payload.lines.findIndex((l) => l.consumptionBasis === 'actual')
    const plannedIndex = payload.lines.findIndex((l) => l.consumptionBasis === 'planned')

    // Real per-field confidence, not one number repeated — a figure measured over 10,000
    // pieces is a different claim from an estimate nobody checked.
    expect(confidence[`lines.${measuredIndex}.consumption`]).toBeGreaterThan(
      confidence[`lines.${plannedIndex}.consumption`]!,
    )
  })

  it('the draft is approvable and becomes a real BOM with its lines', async () => {
    await compileOutcome(ctx, { orderId })
    const seeded = await seedCostSheet(ctx, { fromOrderId: orderId, targetRfqId: rfqId })

    const approved = await approve(ownerCtx, { pendingChangeId: seeded.pendingChangeId })
    expect(approved.status).toBe('committed')

    const [bom] = await db.select().from(boms).where(eq(boms.id, approved.committedRowId!))
    // The provenance survives onto the row: these numbers came off a past order.
    expect(bom!.source).toBe('seeded')
    expect(bom!.styleCode).toBe('TS-300')

    const committedLines = await db
      .select()
      .from(bomLines)
      .where(eq(bomLines.bomId, approved.committedRowId!))

    expect(committedLines).toHaveLength(2)
    const fabric = committedLines.find((l) => l.itemRef === 'FAB-JERSEY-180')!
    expect(fabric.consumption).toBe('1.5000')
    expect(fabric.consumptionBasis).toBe('actual')
  })

  it('REFUSES to seed from an order whose outcome was never compiled', async () => {
    const [fresh] = await db
      .insert(orders)
      .values({
        companyId: COMPANY,
        buyerId,
        poNumbers: [`PO-MEM-FRESH-${randomUUID().slice(0, 6)}`],
        currency: 'USD',
        plannedExFactoryDate: '2026-06-30',
      })
      .returning({ id: orders.id })

    try {
      // Seeding from an uncompiled order would copy the ESTIMATES off its BOM and present
      // them as history. The entire value of seeding is that the numbers were measured.
      await expect(
        seedCostSheet(ctx, { fromOrderId: fresh!.id, targetRfqId: rfqId }),
      ).rejects.toMatchObject({ messageKey: 'memory.errors.no_outcome' })
    } finally {
      await db.delete(orders).where(eq(orders.id, fresh!.id))
    }
  })

  it('refuses another company’s RFQ as the target', async () => {
    await compileOutcome(ctx, { orderId })
    // Postgres runs FK checks with RLS bypassed, so the foreign key alone would accept it.
    await expect(
      seedCostSheet(otherCtx, { fromOrderId: orderId, targetRfqId: rfqId }),
    ).rejects.toMatchObject({ messageKey: 'memory.errors.rfq_not_found' })
  })
})

describe('1.6 · defects come from the checks recorded against the order', () => {
  it('ranks them and marks the source present', async () => {
    await db.insert(inlineChecks).values([
      {
        companyId: COMPANY,
        lineId,
        orderId,
        checkedOn: '2026-03-01',
        operation: 'sideseam',
        checkedQty: 200,
        defects: [
          { code: 'BROKEN_STITCH', count: 12 },
          { code: 'OIL_STAIN', count: 3 },
        ],
        defectQty: 15,
      },
      {
        companyId: COMPANY,
        lineId,
        orderId,
        checkedOn: '2026-03-02',
        operation: 'sideseam',
        checkedQty: 200,
        defects: [{ code: 'BROKEN_STITCH', count: 8 }],
        defectQty: 8,
      },
    ])

    try {
      await compileOutcome(ctx, { orderId })
      const outcome = await outcomeFor(ctx, orderId)

      expect(outcome!.compiledSources.defects).toBe(true)
      const top = outcome!.topDefects as { code: string; count: number }[]
      expect(top[0]).toMatchObject({ code: 'BROKEN_STITCH', count: 20 })
    } finally {
      await db.delete(inlineChecks).where(eq(inlineChecks.orderId, orderId))
      await compileOutcome(ctx, { orderId })
    }
  })
})
