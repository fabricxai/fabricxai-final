/**
 * The `queries.ts` read layers, part two — the commercial and floor screens.
 *
 * Same standard as part one: every case is a figure that could be plausible and
 * wrong, and two of them WERE. Writing these found:
 *
 *  - `recentGrns` counting lines by comparing `rolls.grn_line_id` against a GRN
 *    id, which are ids of different tables — every receipt reported zero lines;
 *  - `pipeline` giving a lead nobody has ever contacted no quiet clock at all,
 *    so the one lead most worth chasing was the only one the quiet list skipped.
 *
 * The rest lock behaviour that is easy to break by accident: a filter that must
 * agree with the gate it mirrors, an ordering that decides what a mechanic fixes
 * first, and a 403 that must stay empty.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, documents, roles, users } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'

import '@/modules/registry'

const RUN = Math.random().toString(36).slice(2, 10)
const client = createDirectClient()
const db = createDirectDb(client)

const USER = `read2-${RUN}`

let ctx: RequestCtx
let companyId: string
let buyerId: string
let lineId: string

beforeAll(async () => {
  const [company] = await db
    .insert(companies)
    .values({ name: `Read Layers II ${RUN}`, slug: `read2-${RUN}` })
    .returning({ id: companies.id })
  companyId = company!.id

  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Reader II' })
  await db.insert(roles).values({ companyId, userId: USER, role: 'owner' })
  ctx = { companyId, userId: USER, roles: ['owner'] }

  const { buyers } = await import('@/modules/buyers/schema')
  const [buyer] = await db
    .insert(buyers)
    .values({ companyId, code: `B2${RUN.slice(0, 4)}`, name: 'Read II Buyer', isActive: true })
    .returning({ id: buyers.id })
  buyerId = buyer!.id

  const { lines } = await import('@/modules/planning/schema')
  const [line] = await db
    .insert(lines)
    .values({ companyId, code: 'L9', name: 'Line 9', isActive: true })
    .returning({ id: lines.id })
  lineId = line!.id
}, 60_000)

afterAll(async () => {
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

describe('commercial: BTB usage counts what the gate counts', () => {
  it('excludes only closed credits, and alerts past the limit', async () => {
    const { btbLcs, lcs } = await import('@/modules/commercial/schema')
    const { register } = await import('@/modules/commercial/queries')

    const [master] = await db
      .insert(lcs)
      .values({
        companyId,
        buyerId,
        number: `LC-BTB-${RUN}`,
        value: '100000.00',
        currency: 'USD',
        issueDate: '2026-06-01',
        latestShipmentDate: '2026-11-30',
        expiryDate: '2026-12-15',
        status: 'active',
      })
      .returning({ id: lcs.id })

    await db.insert(btbLcs).values([
      // Draft and active both still consume the master — the money is committed
      // the moment the credit is opened, not when it is drawn.
      { companyId, masterLcId: master!.id, number: `BTB-A-${RUN}`, value: '40000.00', currency: 'USD', status: 'active' },
      { companyId, masterLcId: master!.id, number: `BTB-B-${RUN}`, value: '25000.00', currency: 'USD', status: 'draft' },
      // Closed is finished business and frees its headroom back up.
      { companyId, masterLcId: master!.id, number: `BTB-C-${RUN}`, value: '30000.00', currency: 'USD', status: 'closed' },
    ])

    const [row] = await register(ctx, {
      now: new Date('2026-07-01T00:00:00Z'),
      expiringWithinDays: 30,
      btbLimitPct: 70,
    })

    expect(row!.btbCount).toBe(2)
    expect(row!.btbValue).toBe('65000.00')
    expect(row!.btbUsedPct).toBe('65.0')
    // Under the limit — the register must not warn about room the gate would allow.
    expect(row!.alerts.map((a) => a.kind)).not.toContain('btb_over_limit')

    await db.insert(btbLcs).values({
      companyId,
      masterLcId: master!.id,
      number: `BTB-D-${RUN}`,
      value: '10000.00',
      currency: 'USD',
      status: 'active',
    })

    const [over] = await register(ctx, {
      now: new Date('2026-07-01T00:00:00Z'),
      expiringWithinDays: 30,
      btbLimitPct: 70,
    })
    expect(over!.btbUsedPct).toBe('75.0')
    expect(over!.alerts).toContainEqual({ kind: 'btb_over_limit', usedPct: '75.0', limitPct: 70 })
  })

  it('reports an expired credit as expired, never as expiring soon', async () => {
    const { lcs } = await import('@/modules/commercial/schema')
    const { register } = await import('@/modules/commercial/queries')

    await db.insert(lcs).values({
      companyId,
      buyerId,
      number: `LC-OLD-${RUN}`,
      value: '50000.00',
      currency: 'USD',
      issueDate: '2026-01-01',
      latestShipmentDate: '2026-03-01',
      expiryDate: '2026-03-20',
      status: 'active',
    })

    const rows = await register(ctx, {
      now: new Date('2026-04-01T00:00:00Z'),
      expiringWithinDays: 30,
      btbLimitPct: 70,
    })
    const row = rows.find((r) => r.number === `LC-OLD-${RUN}`)!

    const kinds = row.alerts.map((a) => a.kind)
    expect(kinds).toContain('expired')
    // A past date is not "expiring in -12 days".
    expect(kinds).not.toContain('expiring')
    // Independent clock: the shipping deadline went first and says so separately.
    expect(kinds).toContain('latest_shipment_passed')
    expect(row.daysToExpiry).toBe(-12)
  })
})

describe('shipment: the EXP number blocks before anything else', () => {
  it('lists blockers in the order somebody must fix them', async () => {
    const { orders } = await import('@/modules/orders/schema')
    const { packingLists, shipmentDocs, shipments } = await import('@/modules/shipment/schema')
    const { shipmentBoard } = await import('@/modules/shipment/queries')

    const [order] = await db
      .insert(orders)
      .values({ companyId, buyerId, poNumbers: [`PO-SHIP-${RUN}`], currency: 'USD', status: 'confirmed' })
      .returning({ id: orders.id })

    const [shipment] = await db
      .insert(shipments)
      .values({
        companyId,
        orderId: order!.id,
        partialNo: 1,
        plannedExFactory: '2026-10-01',
        mode: 'sea',
        portStatus: 'planned',
      })
      .returning({ id: shipments.id })

    await db.insert(packingLists).values({
      companyId,
      orderId: order!.id,
      shipmentId: shipment!.id,
      version: 1,
      totalCartons: 10,
      totalQty: 1000,
      status: 'draft',
    })
    // A document that reached the bank has a file behind it — the schema refuses
    // a "submitted" row with nothing attached, which is the right refusal.
    const [file] = await db
      .insert(documents)
      .values({
        companyId,
        bucket: 'docs',
        objectKey: `test/${RUN}/invoice.pdf`,
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      })
      .returning({ id: documents.id })

    await db.insert(shipmentDocs).values([
      {
        companyId,
        shipmentId: shipment!.id,
        kind: 'invoice',
        status: 'submitted',
        documentId: file!.id,
        submittedAt: new Date('2026-09-29T09:00:00Z'),
      },
      { companyId, shipmentId: shipment!.id, kind: 'packing_list', status: 'pending' },
    ])

    const rows = await shipmentBoard(ctx)
    const row = rows.find((r) => r.id === shipment!.id)!

    // The legal blocker first: without an EXP number the presentation cannot be
    // made at all, so fixing the documents first wastes a day.
    expect(row.blockers).toEqual(['no EXP number', 'packing list not approved', '1 documents not ready'])
    expect(row.poNumber).toBe(`PO-SHIP-${RUN}`)
  })

  it('reads the live packing list, not a superseded one', async () => {
    const { orders } = await import('@/modules/orders/schema')
    const { packingLists, shipments } = await import('@/modules/shipment/schema')
    const { shipmentBoard } = await import('@/modules/shipment/queries')

    const [order] = await db
      .insert(orders)
      .values({ companyId, buyerId, poNumbers: [`PO-PL-${RUN}`], currency: 'USD', status: 'confirmed' })
      .returning({ id: orders.id })

    const [shipment] = await db
      .insert(shipments)
      .values({
        companyId,
        orderId: order!.id,
        partialNo: 1,
        plannedExFactory: '2026-10-05',
        expNumber: `EXP-${RUN}`,
        mode: 'sea',
        portStatus: 'planned',
      })
      .returning({ id: shipments.id })

    // Inserted newest-first on purpose: if the read ever relies on insertion
    // order instead of version, this passes for the wrong reason and the board
    // shows a carton count that was replaced.
    await db.insert(packingLists).values([
      {
        companyId,
        orderId: order!.id,
        shipmentId: shipment!.id,
        version: 2,
        totalCartons: 12,
        totalQty: 1200,
        status: 'approved',
        // An approved list names who approved it; the schema will not take one
        // that does not.
        approvedBy: USER,
        approvedAt: new Date('2026-09-28T10:00:00Z'),
      },
      {
        companyId,
        orderId: order!.id,
        shipmentId: shipment!.id,
        version: 1,
        totalCartons: 9,
        totalQty: 900,
        status: 'superseded',
      },
    ])

    const rows = await shipmentBoard(ctx)
    const row = rows.find((r) => r.id === shipment!.id)!

    expect(row.packingList).toMatchObject({ version: 2, totalCartons: 12, status: 'approved' })
    // With an EXP number and an approved list, only the checklist is missing.
    expect(row.blockers).toEqual(['no document checklist'])
  })
})

describe('store: a receipt reports how many lines it actually has', () => {
  it('counts the GRN lines, not rows of an unrelated table', async () => {
    const { grnLines, grns, items } = await import('@/modules/store/schema')
    const { recentGrns } = await import('@/modules/store/queries')

    const [fabric] = await db
      .insert(items)
      .values({ companyId, code: `FAB-${RUN}`, kind: 'fabric', name: 'Jersey 180gsm', uom: 'kg' })
      .returning({ id: items.id })
    const [trim] = await db
      .insert(items)
      .values({ companyId, code: `TRM-${RUN}`, kind: 'trim', name: 'Care label', uom: 'pcs' })
      .returning({ id: items.id })

    const [grn] = await db
      .insert(grns)
      .values({ companyId, challanNo: `CH-${RUN}`, receivedAt: '2026-09-15', bonded: false })
      .returning({ id: grns.id })

    await db.insert(grnLines).values([
      { companyId, grnId: grn!.id, itemId: fabric!.id, qty: '500.00', unit: 'kg' },
      { companyId, grnId: grn!.id, itemId: trim!.id, qty: '2000.00', unit: 'pcs' },
    ])

    const rows = await recentGrns(ctx)
    const row = rows.find((r) => r.id === grn!.id)!

    // Two lines were received. This read previously matched roll→line ids
    // against a GRN id and reported nothing at all.
    expect(row.lineCount).toBe(2)
  })
})

describe('maintenance: the board is ordered by what stops production', () => {
  it('puts a line down above an older ordinary fault', async () => {
    const { tickets } = await import('@/modules/maintenance/schema')
    const { ticketBoard } = await import('@/modules/maintenance/queries')

    const now = new Date('2026-09-20T12:00:00Z')

    await db.insert(tickets).values([
      // Reported two days ago and still only a nuisance.
      {
        companyId,
        lineId,
        source: 'manual',
        priority: 'normal',
        status: 'open',
        reportedAt: new Date('2026-09-18T12:00:00Z'),
        notes: 'thread guide loose',
      },
      // Ten minutes old, and an entire line is standing.
      {
        companyId,
        lineId,
        source: 'downtime_auto',
        downtimeId: null,
        priority: 'line_down',
        status: 'open',
        reportedAt: new Date('2026-09-20T11:50:00Z'),
        notes: 'main motor dead',
      },
      {
        companyId,
        lineId,
        source: 'manual',
        priority: 'normal',
        status: 'resolved',
        reportedAt: new Date('2026-09-19T08:00:00Z'),
        resolvedAt: new Date('2026-09-19T09:00:00Z'),
        notes: 'already fixed',
      },
    ])

    const board = await ticketBoard(ctx, { now })

    // Age is the tiebreak, never the sort — first-come-first-served here means a
    // line stands idle while somebody tightens a thread guide.
    expect(board.map((t) => t.priority)).toEqual(['line_down', 'normal'])
    expect(board[0]!.openHours).toBe(0)
    expect(board[1]!.openHours).toBe(48)
    // A resolved ticket is off the board entirely.
    expect(board).toHaveLength(2)
  })

  it('separates a part that is low from one that is gone', async () => {
    const { spareParts } = await import('@/modules/maintenance/schema')
    const { spares } = await import('@/modules/maintenance/queries')

    await db.insert(spareParts).values([
      { companyId, code: `SP-A-${RUN}`, name: 'Needle DBx1 #11', onHand: 2, minLevel: 5 },
      { companyId, code: `SP-B-${RUN}`, name: 'Rotary hook', onHand: 0, minLevel: 1 },
      { companyId, code: `SP-C-${RUN}`, name: 'Bobbin case', onHand: 40, minLevel: 10 },
    ])

    const rows = await spares(ctx)
    const byCode = new Map(rows.map((r) => [r.code, r]))

    expect(byCode.get(`SP-A-${RUN}`)).toMatchObject({ low: true, out: false })
    // Out is not merely "very low" — the next repair needing it stops.
    expect(byCode.get(`SP-B-${RUN}`)).toMatchObject({ low: true, out: true })
    expect(byCode.get(`SP-C-${RUN}`)).toMatchObject({ low: false, out: false })
  })
})

describe('buyers: the quiet clock runs from the last real contact', () => {
  it('measures activity, not a row that was merely touched', async () => {
    const { leadActivities, leads } = await import('@/modules/buyers/schema')
    const { pipeline } = await import('@/modules/buyers/queries')

    const [lead] = await db
      .insert(leads)
      .values({ companyId, source: 'fair', companyName: `Worked Co ${RUN}`, stage: 'contacted' })
      .returning({ id: leads.id })

    await db.insert(leadActivities).values([
      { companyId, leadId: lead!.id, kind: 'call', summary: 'intro call', occurredAt: '2026-08-01' },
      { companyId, leadId: lead!.id, kind: 'email', summary: 'sent price', occurredAt: '2026-09-10' },
    ])

    // Renaming the stage bumps updated_at without anybody contacting the buyer;
    // reading that column instead would reset the clock on exactly the leads
    // that have gone cold.
    await db.update(leads).set({ notes: 'renamed' }).where(eq(leads.id, lead!.id))

    const { quiet, stages } = await pipeline(ctx, {
      now: new Date('2026-09-20T00:00:00Z'),
      quietAfterDays: 14,
    })
    const card = stages
      .find((s) => s.stage === 'contacted')!
      .leads.find((c) => c.companyName === `Worked Co ${RUN}`)!

    // From the LATEST activity, 10 September, not the first one. Reading the
    // earliest instead would put this lead 50 days quiet and on the chase list.
    expect(card.daysQuiet).toBe(10)
    expect(card.lastActivity).toMatchObject({ kind: 'email', occurredAt: '2026-09-10' })
    expect(quiet.map((c) => c.companyName)).not.toContain(`Worked Co ${RUN}`)
  })

  it('flags a lead nobody has ever contacted', async () => {
    const { leads } = await import('@/modules/buyers/schema')
    const { pipeline } = await import('@/modules/buyers/queries')

    await db.insert(leads).values({
      companyId,
      source: 'inbound',
      companyName: `Untouched Co ${RUN}`,
      stage: 'new',
      createdAt: new Date('2026-08-01T09:00:00Z'),
    })

    const { quiet } = await pipeline(ctx, {
      now: new Date('2026-09-20T00:00:00Z'),
      quietAfterDays: 14,
    })
    const card = quiet.find((c) => c.companyName === `Untouched Co ${RUN}`)

    // Fifty days in the pipeline with nothing logged. This is the quietest lead
    // there is, and it used to be the only one the quiet list left out.
    expect(card, 'a never-contacted lead must appear in the quiet list').toBeDefined()
    expect(card!.daysQuiet).toBe(50)
    // The clock runs, but the card still says nothing was ever logged.
    expect(card!.lastActivity).toBeNull()
  })

  it('leaves a settled lead alone', async () => {
    const { leads } = await import('@/modules/buyers/schema')
    const { pipeline } = await import('@/modules/buyers/queries')

    await db.insert(leads).values({
      companyId,
      source: 'referral',
      companyName: `Closed Co ${RUN}`,
      stage: 'lost',
      lostReason: 'price',
      createdAt: new Date('2026-01-01T09:00:00Z'),
    })

    const { quiet, stages } = await pipeline(ctx, {
      now: new Date('2026-09-20T00:00:00Z'),
      quietAfterDays: 14,
    })

    // Quiet since January, and rightly so — nobody needs chasing about a lead
    // that is already lost.
    expect(quiet.map((c) => c.companyName)).not.toContain(`Closed Co ${RUN}`)
    expect(stages.find((s) => s.stage === 'lost')!.leads.map((l) => l.companyName)).toContain(
      `Closed Co ${RUN}`,
    )
  })
})

describe('workforce: payroll refuses without saying what it is', () => {
  const OUTSIDER: RequestCtx = { companyId: '', userId: '', roles: ['merchandiser'] }

  it('throws a 403 carrying nothing at all', async () => {
    const { activeGazette, canSeePayroll } = await import('@/modules/workforce/queries')
    const outsider = { ...OUTSIDER, companyId, userId: USER }

    expect(canSeePayroll(outsider)).toBe(false)

    const error = await activeGazette(outsider).then(
      () => null,
      (e: unknown) => e as { code?: string; messageKey?: string; details?: unknown },
    )

    expect(error).not.toBeNull()
    expect(error!.code).toBe('forbidden')
    // Empty on purpose: "you need hr or owner" confirms the endpoint exists and
    // names the role worth phishing for.
    expect(error!.messageKey).toBe('')
    expect(error!.details).toEqual({})
  })

  it('refuses the run list on the same terms', async () => {
    const { payrollRunList } = await import('@/modules/workforce/queries')

    await expect(payrollRunList({ ...OUTSIDER, companyId, userId: USER })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('still serves the roster, which is not payroll', async () => {
    const { workers } = await import('@/modules/workforce/schema')
    const { canSeePayroll, roster } = await import('@/modules/workforce/queries')

    await db.insert(workers).values([
      {
        companyId,
        employeeNo: `E1-${RUN}`,
        name: 'Rima Akter',
        grade: '4',
        section: 'sewing',
        joinDate: '2025-02-01',
        status: 'active',
      },
      {
        companyId,
        employeeNo: `E2-${RUN}`,
        name: 'Left Already',
        grade: '5',
        section: 'sewing',
        joinDate: '2024-01-01',
        exitDate: '2026-05-01',
        status: 'active',
      },
    ])

    const merchandiser = { ...OUTSIDER, companyId, userId: USER }
    expect(canSeePayroll(merchandiser)).toBe(false)

    // Headcount and sections are ordinary factory data — gating them would hide
    // the floor from the people who run it.
    const rows = await roster(merchandiser)
    expect(rows.map((r) => r.employeeNo)).toContain(`E1-${RUN}`)
    // Someone who has left is not on the roster.
    expect(rows.map((r) => r.employeeNo)).not.toContain(`E2-${RUN}`)
  })
})
