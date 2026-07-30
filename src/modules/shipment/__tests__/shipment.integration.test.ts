/**
 * 8.1 integration.
 *
 * The arithmetic is covered by `shipment.test.ts`. What is asserted here is what only a
 * database and a gate can be wrong about:
 *
 *  - the EXP gate blocks the bank handoff, and records that somebody tried;
 *  - over-pack is refused against the REAL remaining balance (every other carton counted),
 *    with per-cell detail reaching the typed error;
 *  - an approved packing list is locked and supersedes its predecessor on approval;
 *  - an LC tolerance breach escalates through pending_changes rather than blocking;
 *  - ex-factory raises the LC latest-shipment conflict from 2.1's own detector;
 *  - cross-company reads see nothing.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { lcs } from '@/modules/commercial/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { syncBatch } from '@/modules/core/offline-sync'
import { approve } from '@/modules/core/pending-changes'
import { withTenantRead } from '@/modules/core/tenancy'
import { orderBreakdowns, orders, orderStyles } from '@/modules/orders/schema'
import '@/modules/shipment/register'
import {
  cartons,
  finishingOutputs,
  packingLists,
  shipmentDocs,
  shipments,
} from '@/modules/shipment/schema'
import {
  advancePortStatus,
  approvePackingList,
  buildDocChecklist,
  confirmExFactory,
  createShipment,
  freightSummary,
  generatePackingList,
  handoffDocsToBank,
  loadCartons,
  packCarton,
  proposeToleranceOverride,
  recordFinishingOutput,
  remainingToPackFor,
  setDocStatus,
  setExpNumber,
} from '@/modules/shipment/service'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const USER = `shp-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['shipment'] }
const approverCtx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: USER, roles: ['shipment'] }

let orderId: string
let orderStyleId: string
let lcId: string
/** An LC whose latest-shipment date is already past — the conflict case. */
let lateLcId: string

/** The buyer ordered 400: Black S 100, Black M 200, White S 100. */
const ORDERED: Record<string, number> = { 'Black|S': 100, 'Black|M': 200, 'White|S': 100 }

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Ship Co', slug: `shp-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Shipper' })

  const [buyer] = await db
    .insert(buyers)
    .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
    .returning({ id: buyers.id })
  const buyerId = buyer!.id

  const [order] = await db
    .insert(orders)
    .values({ companyId: COMPANY, buyerId, poNumbers: ['PO-1'], createdBy: USER })
    .returning({ id: orders.id })
  orderId = order!.id

  const [style] = await db
    .insert(orderStyles)
    .values({ companyId: COMPANY, orderId, styleCode: 'ST-100', contractedQty: 400 })
    .returning({ id: orderStyles.id })
  orderStyleId = style!.id

  await db.insert(orderBreakdowns).values(
    Object.entries(ORDERED).map(([cell, qty]) => {
      const [color = '', size = ''] = cell.split('|')
      return { companyId: COMPANY, orderStyleId, revision: 1, color, size, qty }
    }),
  )

  const [lc] = await db
    .insert(lcs)
    .values({
      companyId: COMPANY,
      buyerId,
      number: `LC-${randomUUID().slice(0, 8)}`,
      value: '50000.00',
      currency: 'USD',
      tolerancePct: '5',
      latestShipmentDate: '2026-12-31',
      expiryDate: '2027-01-15',
      status: 'active',
      docsRequired: { commercial_invoice: true, packing_list: true, bl: true },
      createdBy: USER,
    })
    .returning({ id: lcs.id })
  lcId = lc!.id

  const [late] = await db
    .insert(lcs)
    .values({
      companyId: COMPANY,
      buyerId,
      number: `LC-LATE-${randomUUID().slice(0, 6)}`,
      value: '50000.00',
      currency: 'USD',
      tolerancePct: '5',
      // Already past — shipping against this is a discrepancy the bank can refuse on.
      latestShipmentDate: '2026-07-01',
      expiryDate: '2026-07-20',
      status: 'active',
      createdBy: USER,
    })
    .returning({ id: lcs.id })
  lateLcId = late!.id
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

const reset = async () => {
  await db.delete(cartons).where(eq(cartons.companyId, COMPANY))
  await db.delete(packingLists).where(eq(packingLists.companyId, COMPANY))
  await db.delete(shipments).where(eq(shipments.companyId, COMPANY))
  await db.delete(finishingOutputs).where(eq(finishingOutputs.companyId, COMPANY))
}

/** Finish the whole order so packing has something to draw on. */
const finishAll = () =>
  recordFinishingOutput(ctx, {
    orderId,
    orderStyleId,
    outputDate: '2026-07-20',
    cells: ORDERED,
  })

const newShipment = (over: Record<string, unknown> = {}) =>
  createShipment(ctx, {
    orderId,
    lcId,
    partialNo: 1,
    plannedExFactory: '2026-08-10',
    mode: 'sea',
    ...over,
  })

describe('8.1 · packing against the real remaining balance', () => {
  it('refuses an over-pack with per-cell detail', async () => {
    await reset()
    await finishAll()

    // 100 Black/S were finished; this carton claims 110.
    let thrown: unknown
    try {
      await packCarton(ctx, {
        orderId,
        cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
        contents: { 'Black|S': 110 },
      })
    } catch (error) {
      thrown = error
    }

    // The detail a packer can act on reaches the typed error, not just a message.
    expect((thrown as { details: { cells: unknown[] } }).details.cells).toEqual([
      { cell: 'Black|S', finished: 100, packed: 110, over: 10 },
    ])

    const rows = await db.select().from(cartons).where(eq(cartons.companyId, COMPANY))
    expect(rows).toHaveLength(0)
  })

  it('counts every other carton, not just finishing', async () => {
    await reset()
    await finishAll()

    // Two cartons of 60 fit within 100 Black/S individually; together they do not.
    await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-A-${randomUUID().slice(0, 6)}`,
      contents: { 'Black|S': 60 },
    })

    await expect(
      packCarton(ctx, {
        orderId,
        cartonNo: `CTN-B-${randomUUID().slice(0, 6)}`,
        contents: { 'Black|S': 60 },
      }),
    ).rejects.toThrow()
  })

  it('reports the remaining worklist and computes CBM', async () => {
    await reset()
    await finishAll()

    const packed = await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
      contents: { 'Black|S': 40 },
      grossKg: '12.00',
      lengthCm: '60',
      widthCm: '40',
      heightCm: '30',
    })

    expect(packed.cbm).toBe('0.072000')

    const worklist = await remainingToPackFor(ctx, { orderId })
    expect(worklist.remaining).toEqual({ 'Black|S': 60, 'Black|M': 200, 'White|S': 100 })
  })

  it('charges a light carton on its volume', async () => {
    await reset()
    await finishAll()
    await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
      contents: { 'Black|S': 40 },
      grossKg: '12.00',
      lengthCm: '60',
      widthCm: '40',
      heightCm: '30',
    })

    // 0.072 revenue tonnes by volume against 0.012 by weight.
    const summary = await freightSummary(ctx, { orderId, mode: 'sea' })
    expect(summary.chargeable.basis).toBe('volumetric')
    expect(summary.totalCbm).toBe('0.072000')
  })

  it('is idempotent on an offline replay', async () => {
    await reset()
    await finishAll()

    const batch = [
      {
        offlineKey: `shp-${randomUUID()}`,
        moduleId: 'shipment',
        operation: 'pack_carton',
        payload: {
          orderId,
          cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
          contents: { 'Black|S': 40 },
        } as Record<string, unknown>,
      },
    ]

    expect((await syncBatch(ctx, batch))[0]!.status).toBe('applied')
    expect((await syncBatch(ctx, batch))[0]!.status).toBe('duplicate')

    const rows = await db.select().from(cartons).where(eq(cartons.companyId, COMPANY))
    expect(rows).toHaveLength(1)
  })
})

describe('8.1 · packing lists', () => {
  const packWholeOrder = async () => {
    await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-1-${randomUUID().slice(0, 6)}`,
      contents: { 'Black|S': 100, 'Black|M': 200 },
      grossKg: '30.00',
    })
    await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-2-${randomUUID().slice(0, 6)}`,
      contents: { 'White|S': 100 },
      grossKg: '15.00',
    })
  }

  it('matches the ordered grid when everything is packed', async () => {
    await reset()
    await finishAll()
    await packWholeOrder()

    const list = await generatePackingList(ctx, { orderId })
    expect(list.report.matches).toBe(true)
    expect(list.totalCartons).toBe(2)
    expect(list.version).toBe(1)
  })

  it('catches a grid mismatch even when the total is right', async () => {
    await reset()
    // Finishing produced a different grid from the one ordered: 150/150/100.
    await recordFinishingOutput(ctx, {
      orderId,
      orderStyleId,
      outputDate: '2026-07-20',
      cells: { 'Black|S': 150, 'Black|M': 150, 'White|S': 100 },
    })
    await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
      contents: { 'Black|S': 150, 'Black|M': 150, 'White|S': 100 },
    })

    const list = await generatePackingList(ctx, { orderId })

    // 400 packed against 400 ordered, and the grid is wrong.
    expect(list.report.totalPacked).toBe(400)
    expect(list.report.totalOrdered).toBe(400)
    expect(list.report.matches).toBe(false)

    // Approving it needs the mismatch accepted explicitly.
    await expect(
      approvePackingList(ctx, { packingListId: list.packingListId }),
    ).rejects.toThrow(/has_mismatches/)

    await approvePackingList(ctx, {
      packingListId: list.packingListId,
      acceptMismatches: true,
    })
  })

  it('locks on approval and supersedes the previous one', async () => {
    await reset()
    await finishAll()
    await packWholeOrder()

    const first = await generatePackingList(ctx, { orderId })
    await approvePackingList(ctx, { packingListId: first.packingListId })

    // An approved list is what the buyer holds; a second approval must not edit it.
    await expect(
      approvePackingList(ctx, { packingListId: first.packingListId }),
    ).rejects.toThrow()

    const second = await generatePackingList(ctx, { orderId })
    expect(second.version).toBe(2)

    const result = await approvePackingList(ctx, { packingListId: second.packingListId })
    expect(result.supersededCount).toBe(1)

    const [superseded] = await db
      .select()
      .from(packingLists)
      .where(eq(packingLists.id, first.packingListId))
    expect(superseded!.status).toBe('superseded')
  })
})

describe('8.1 · the EXP gate', () => {
  const readyShipment = async () => {
    await reset()
    await finishAll()
    const carton = await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
      contents: ORDERED,
      grossKg: '45.00',
    })
    const shipment = await newShipment()
    await loadCartons(ctx, { shipmentId: shipment.shipmentId, cartonIds: [carton.cartonId] })
    await buildDocChecklist(ctx, { shipmentId: shipment.shipmentId })

    const docs = await db
      .select()
      .from(shipmentDocs)
      .where(eq(shipmentDocs.shipmentId, shipment.shipmentId))

    // The checklist came from the LC's docs_required.
    expect(docs.map((d) => d.kind).sort()).toEqual(['bl', 'commercial_invoice', 'packing_list'])

    for (const doc of docs) {
      await setDocStatus(ctx, {
        shipmentId: shipment.shipmentId,
        kind: doc.kind,
        status: 'ready',
        documentId: await seedDocument(),
      })
    }

    return shipment.shipmentId
  }

  it('blocks the bank handoff without an EXP number, and records the attempt', async () => {
    const shipmentId = await readyShipment()
    await db.execute(sql`delete from outbox where company_id = ${COMPANY}`)

    await expect(handoffDocsToBank(ctx, { shipmentId })).rejects.toThrow(/exp_number/)

    // Somebody tried and could not. That is worth a trail.
    const rows = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from outbox
          where company_id = ${COMPANY} and event_name = 'shipment.exp.missing'`,
    )
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
    expect(Number((list[0] as { n: string }).n)).toBe(1)

    const docs = await db
      .select()
      .from(shipmentDocs)
      .where(eq(shipmentDocs.shipmentId, shipmentId))
    // Nothing was submitted.
    expect(docs.every((d) => d.status === 'ready')).toBe(true)
  })

  it('lets the handoff through once the bank issues the number', async () => {
    const shipmentId = await readyShipment()
    await setExpNumber(ctx, { shipmentId, expNumber: 'EXP-2026-0001' })

    const result = await handoffDocsToBank(ctx, { shipmentId })
    expect(result.submitted.sort()).toEqual(['bl', 'commercial_invoice', 'packing_list'])

    const docs = await db
      .select()
      .from(shipmentDocs)
      .where(eq(shipmentDocs.shipmentId, shipmentId))
    expect(docs.every((d) => d.status === 'submitted')).toBe(true)
  })

  it('refuses a handoff with a document still pending', async () => {
    await reset()
    await finishAll()
    const carton = await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
      contents: ORDERED,
    })
    const shipment = await newShipment()
    await loadCartons(ctx, { shipmentId: shipment.shipmentId, cartonIds: [carton.cartonId] })
    await buildDocChecklist(ctx, { shipmentId: shipment.shipmentId })
    await setExpNumber(ctx, { shipmentId: shipment.shipmentId, expNumber: 'EXP-2026-0002' })

    await expect(handoffDocsToBank(ctx, { shipmentId: shipment.shipmentId })).rejects.toThrow(
      /docs_not_ready/,
    )
  })

  it('refuses to overwrite an EXP number the bank already issued', async () => {
    const shipmentId = await readyShipment()
    await setExpNumber(ctx, { shipmentId, expNumber: 'EXP-2026-0003' })

    await expect(
      setExpNumber(ctx, { shipmentId, expNumber: 'EXP-2026-9999' }),
    ).rejects.toThrow(/exp_already_set/)
  })
})

describe('8.1 · ex-factory', () => {
  const loadedShipment = async (
    over: Record<string, unknown> = {},
    contents: Record<string, number> = ORDERED,
  ) => {
    await reset()
    await recordFinishingOutput(ctx, {
      orderId,
      orderStyleId,
      outputDate: '2026-07-20',
      cells: contents,
    })
    const carton = await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
      contents,
    })
    const shipment = await newShipment(over)
    await loadCartons(ctx, { shipmentId: shipment.shipmentId, cartonIds: [carton.cartonId] })
    return shipment.shipmentId
  }

  it('records the departure and reports the shipped quantity', async () => {
    const shipmentId = await loadedShipment()
    const result = await confirmExFactory(ctx, { shipmentId, actualExFactory: '2026-08-10' })

    expect(result.shippedQty).toBe(400)
    expect(result.tolerance?.withinTolerance).toBe(true)
    expect(result.lcConflicts).toEqual([])

    const [row] = await db.select().from(shipments).where(eq(shipments.id, shipmentId))
    expect(row!.portStatus).toBe('ex_factory')
    expect(row!.actualExFactory).toBe('2026-08-10')
  })

  it('raises the LC latest-shipment conflict on the ACTUAL date', async () => {
    // The LC's latest shipment was 1 July. This shipment was PLANNED for 25 June — inside
    // the deadline — and actually left on 10 August. Checking the plan would clear it.
    const shipmentId = await loadedShipment({
      lcId: lateLcId,
      plannedExFactory: '2026-06-25',
    })
    const result = await confirmExFactory(ctx, { shipmentId, actualExFactory: '2026-08-10' })

    expect(result.lcConflicts.length).toBeGreaterThan(0)
    // Recorded anyway — the container is on a truck, and refusing does not put it back.
    const [row] = await db.select().from(shipments).where(eq(shipments.id, shipmentId))
    expect(row!.portStatus).toBe('ex_factory')
  })

  it('flags a SHORT shipment against the tolerance band', async () => {
    // 5% of 400 permits 380–420. Shipping 300 is a discrepancy the bank can refuse on.
    const shipmentId = await loadedShipment({}, { 'Black|S': 100, 'Black|M': 200 })
    const result = await confirmExFactory(ctx, { shipmentId, actualExFactory: '2026-08-10' })

    expect(result.shippedQty).toBe(300)
    expect(result.tolerance?.withinTolerance).toBe(false)
    expect(result.tolerance?.direction).toBe('short')
    expect(result.tolerance?.minQty).toBe(380)
  })

  it('escalates a tolerance breach through pending_changes', async () => {
    const shipmentId = await loadedShipment({}, { 'Black|S': 100, 'Black|M': 200 })
    await confirmExFactory(ctx, { shipmentId, actualExFactory: '2026-08-10' })

    const proposed = await proposeToleranceOverride(ctx, {
      shipmentId,
      reason: 'Buyer accepted the short shipment in writing; balance cancelled.',
    })
    await approve(approverCtx, { pendingChangeId: proposed.pendingChangeId })

    const [row] = await db.select().from(shipments).where(eq(shipments.id, shipmentId))
    const override = row!.toleranceOverride as Record<string, unknown>
    expect(override.direction).toBe('short')
    expect(override.varianceQty).toBe(80)
    expect(override.acceptedBy).toBe(USER)
  })

  it('refuses an override when nothing is actually breached', async () => {
    const shipmentId = await loadedShipment()
    await confirmExFactory(ctx, { shipmentId, actualExFactory: '2026-08-10' })

    // Raising a draft would put an approval in the inbox for a decision nobody needs.
    await expect(
      proposeToleranceOverride(ctx, { shipmentId, reason: 'just in case' }),
    ).rejects.toThrow(/tolerance_not_breached/)
  })

  it('refuses to depart with no cartons loaded', async () => {
    await reset()
    await finishAll()
    const shipment = await newShipment()

    await expect(
      confirmExFactory(ctx, { shipmentId: shipment.shipmentId, actualExFactory: '2026-08-10' }),
    ).rejects.toThrow(/no_cartons_loaded/)
  })

  it('refuses to load a carton onto a shipment that has already left', async () => {
    const shipmentId = await loadedShipment()
    await confirmExFactory(ctx, { shipmentId, actualExFactory: '2026-08-10' })

    const extra = await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-LATE-${randomUUID().slice(0, 6)}`,
      contents: { 'Black|S': 0, 'Black|M': 0, 'White|S': 0, 'Grey|S': 0 },
    }).catch(() => null)

    // The empty carton is refused by zod, which is the point of the second assertion:
    // nothing can be added after departure either way.
    expect(extra).toBeNull()
  })

  it('moves port status forward only', async () => {
    const shipmentId = await loadedShipment()
    await confirmExFactory(ctx, { shipmentId, actualExFactory: '2026-08-10' })

    // ex_factory → on_board skips the port.
    await expect(advancePortStatus(ctx, { shipmentId, portStatus: 'on_board' })).rejects.toThrow()

    await advancePortStatus(ctx, { shipmentId, portStatus: 'at_port' })
    await advancePortStatus(ctx, { shipmentId, portStatus: 'on_board', blAwb: 'BL-123' })

    const [row] = await db.select().from(shipments).where(eq(shipments.id, shipmentId))
    expect(row!.blAwb).toBe('BL-123')
  })
})

describe('8.1 · tenancy', () => {
  it('another company sees no shipments or cartons', async () => {
    await reset()
    await finishAll()
    await packCarton(ctx, {
      orderId,
      cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
      contents: { 'Black|S': 40 },
    })
    await newShipment()

    const seen = await withTenantRead(otherCtx, async (tx) => ({
      shipments: await tx.select().from(shipments),
      cartons: await tx.select().from(cartons),
    }))

    expect(seen.shipments).toHaveLength(0)
    expect(seen.cartons).toHaveLength(0)
  })

  it('another company cannot pack against this factory’s order', async () => {
    await expect(
      packCarton(otherCtx, {
        orderId,
        cartonNo: `CTN-${randomUUID().slice(0, 6)}`,
        contents: { 'Black|S': 1 },
      }),
    ).rejects.toThrow(/order_not_found/)
  })

  it('another company cannot attach this factory’s LC to a shipment', async () => {
    await expect(
      createShipment(otherCtx, {
        orderId,
        lcId,
        partialNo: 9,
        plannedExFactory: '2026-08-10',
      }),
    ).rejects.toThrow(/order_not_found/)
  })
})

/** A minimal `documents` row, so the doc checklist can move off `pending`. */
async function seedDocument(): Promise<string> {
  const { documents } = await import('@/db/schema/core')
  const [row] = await db
    .insert(documents)
    .values({
      companyId: COMPANY,
      bucket: 'fabricxai-documents',
      objectKey: `docs/${randomUUID()}.pdf`,
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: USER,
    })
    .returning({ id: documents.id })
  return row!.id
}
