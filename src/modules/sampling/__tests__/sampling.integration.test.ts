/**
 * 1.4 integration.
 *
 * The gate logic is covered by `sampling.test.ts`. What is asserted here is what only a
 * database and a wired-up module can be wrong about — and the headline is the last block:
 * **importing 1.4 makes cutting possible**, which is the coupling between these two
 * modules working in the safe direction.
 *
 *  - round numbers are assigned server-side, so a caller cannot overwrite a verdict;
 *  - a later rejection closes a gate that an earlier approval opened, and says so;
 *  - `approved_with_comments` opens the gate and carries its comments;
 *  - the escalation fires on an unapproved PP inside the cutting window;
 *  - cross-company reads see nothing.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'
import { grnLines, grns, issueLines, issues, items, locations, rolls } from '@/modules/store/schema'
import { createLay, createMarker } from '@/modules/cutting/service'
import '@/modules/cutting/register'
import { orderBreakdowns, orders, orderStyles, tnaMilestones } from '@/modules/orders/schema'
// Importing this module is what registers the PP provider — see the last describe block.
import '@/modules/sampling/register'
import { seedApprovedPpSample } from '@/modules/sampling/demo'
import { sampleFeedbackRounds, sampleRequests } from '@/modules/sampling/schema'
import {
  addSampleCost,
  advanceStage,
  checkPpApprovalFor,
  createSampleRequest,
  dispatchSample,
  ppBlockingAlerts,
  recordFeedback,
  sampleTimeline,
} from '@/modules/sampling/service'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const USER = `smp-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['merchandiser'] }
const cutCtx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['production'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: USER, roles: ['merchandiser'] }

const POLICY = { ppBlockingWindowDays: 5 }
const TODAY = '2026-07-30'

let orderId: string
let orderStyleId: string
let markerId: string
let rollIds: string[] = []

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Sample Co', slug: `smp-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Merch' })

  const [buyer] = await db
    .insert(buyers)
    .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
    .returning({ id: buyers.id })

  const [order] = await db
    .insert(orders)
    .values({ companyId: COMPANY, buyerId: buyer!.id, poNumbers: ['PO-1'], createdBy: USER })
    .returning({ id: orders.id })
  orderId = order!.id

  const [style] = await db
    .insert(orderStyles)
    .values({ companyId: COMPANY, orderId, styleCode: 'ST-100', contractedQty: 400 })
    .returning({ id: orderStyles.id })
  orderStyleId = style!.id

  await db.insert(orderBreakdowns).values([
    { companyId: COMPANY, orderStyleId, revision: 1, color: 'Black', size: 'S', qty: 100 },
    { companyId: COMPANY, orderStyleId, revision: 1, color: 'Black', size: 'M', qty: 200 },
    { companyId: COMPANY, orderStyleId, revision: 1, color: 'Black', size: 'L', qty: 100 },
  ])

  // Store fixtures so the cutting module's OTHER gate (issued fabric) is satisfied and
  // the PP gate is the only thing under test.
  const [item] = await db
    .insert(items)
    .values({ companyId: COMPANY, code: 'FAB-1', name: 'Single Jersey', kind: 'fabric', uom: 'm' })
    .returning({ id: items.id })
  const [location] = await db
    .insert(locations)
    .values({ companyId: COMPANY, code: 'GEN-1', name: 'General store', kind: 'general' })
    .returning({ id: locations.id })
  const [grn] = await db
    .insert(grns)
    .values({
      companyId: COMPANY,
      challanNo: `CH-${randomUUID().slice(0, 6)}`,
      receivedAt: '2026-07-01',
      createdBy: USER,
    })
    .returning({ id: grns.id })
  const [grnLine] = await db
    .insert(grnLines)
    .values({ companyId: COMPANY, grnId: grn!.id, itemId: item!.id, qty: '1000.00', unit: 'm' })
    .returning({ id: grnLines.id })

  const inserted = await db
    .insert(rolls)
    .values(
      ['R-1', 'R-2'].map((rollNo) => ({
        companyId: COMPANY,
        grnLineId: grnLine!.id,
        itemId: item!.id,
        rollNo: `${rollNo}-${randomUUID().slice(0, 6)}`,
        qty: '250.00',
        unit: 'm',
        locationId: location!.id,
        status: 'issued' as const,
      })),
    )
    .returning({ id: rolls.id })
  rollIds = inserted.map((r) => r.id)

  const [issue] = await db
    .insert(issues)
    .values({ companyId: COMPANY, orderId, createdBy: USER })
    .returning({ id: issues.id })
  await db.insert(issueLines).values(
    rollIds.map((rollId) => ({
      companyId: COMPANY,
      issueId: issue!.id,
      itemId: item!.id,
      rollId,
      qty: '250.00',
      unit: 'm',
    })),
  )

  const marker = await createMarker(cutCtx, {
    code: `MK-${randomUUID().slice(0, 6)}`,
    styleCode: 'ST-100',
    sizeRatio: { S: 1, M: 2, L: 1 },
    layLengthMeters: '6.40',
  })
  markerId = marker.markerId
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

const clearSamples = async () => {
  await db.delete(sampleRequests).where(eq(sampleRequests.companyId, COMPANY))
}

const newPp = async (over: Record<string, unknown> = {}) =>
  createSampleRequest(ctx, {
    orderId,
    type: 'pp',
    styleCode: 'ST-100',
    requestNo: `PP-${randomUUID().slice(0, 8)}`,
    ...over,
  })

describe('1.4 · the sample room', () => {
  it('refuses a request that belongs to both an RFQ and an order', async () => {
    await expect(
      createSampleRequest(ctx, {
        orderId,
        rfqId: randomUUID(),
        type: 'proto',
        styleCode: 'ST-100',
        requestNo: `X-${randomUUID().slice(0, 8)}`,
      }),
    ).rejects.toThrow()
  })

  it('refuses a PP sample with no order — there is nothing to pre-produce for', async () => {
    await expect(
      createSampleRequest(ctx, {
        rfqId: randomUUID(),
        type: 'pp',
        styleCode: 'ST-100',
        requestNo: `X-${randomUUID().slice(0, 8)}`,
      }),
    ).rejects.toThrow()
  })

  it('moves stages forward only', async () => {
    await clearSamples()
    const sample = await newPp()

    await advanceStage(ctx, { sampleRequestId: sample.sampleRequestId, stage: 'pattern' })
    await advanceStage(ctx, { sampleRequestId: sample.sampleRequestId, stage: 'sewing' })

    // Going back to cutting is a remake, which is a new sample request rather than an
    // edit to this one's history.
    await expect(
      advanceStage(ctx, { sampleRequestId: sample.sampleRequestId, stage: 'cutting' }),
    ).rejects.toThrow(/stage_not_forward/)
  })

  it('sums sample costs and refuses to mix currencies', async () => {
    await clearSamples()
    const sample = await newPp()

    await addSampleCost(ctx, { sampleRequestId: sample.sampleRequestId, amount: '1250.50' })
    const total = await addSampleCost(ctx, {
      sampleRequestId: sample.sampleRequestId,
      amount: '340.25',
    })
    expect(total.runningTotal).toBe('1590.75')

    await expect(
      addSampleCost(ctx, {
        sampleRequestId: sample.sampleRequestId,
        amount: '20.00',
        currency: 'USD',
      }),
    ).rejects.toThrow(/mixed_cost_currencies/)
  })
})

describe('1.4 · feedback rounds', () => {
  it('assigns round numbers server-side so a caller cannot overwrite a verdict', async () => {
    await clearSamples()
    const sample = await newPp()
    // A sample has to be made before it can be couriered — `requested` is not a state
    // you can dispatch from.
    await advanceStage(ctx, { sampleRequestId: sample.sampleRequestId, stage: 'pattern' })
    await dispatchSample(ctx, {
      sampleRequestId: sample.sampleRequestId,
      courier: 'DHL',
      awb: 'AWB-1',
    })

    const first = await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'rejected',
      recordedOn: '2026-07-10',
    })
    const second = await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-20',
    })

    expect(first.round).toBe(1)
    expect(second.round).toBe(2)

    const rows = await db
      .select()
      .from(sampleFeedbackRounds)
      .where(eq(sampleFeedbackRounds.sampleRequestId, sample.sampleRequestId))
    expect(rows).toHaveLength(2)
  })

  it('opens the gate on approval and emits pp_approved once', async () => {
    await clearSamples()
    await db.execute(sql`delete from outbox where company_id = ${COMPANY}`)

    const sample = await newPp()
    const result = await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-20',
    })

    expect(result.ppGateOpen).toBe(true)

    const gate = await checkPpApprovalFor(ctx, { orderId, orderStyleId })
    expect(gate.passed).toBe(true)

    const rows = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from outbox
          where company_id = ${COMPANY} and event_name = 'sampling.pp_approved'`,
    )
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
    expect(Number((list[0] as { n: string }).n)).toBe(1)
  })

  it('opens the gate on approved_with_comments, carrying the comments', async () => {
    await clearSamples()
    const sample = await newPp()

    const result = await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved_with_comments',
      recordedOn: '2026-07-20',
      comments: [
        { area: 'collar', comment: 'Reduce by 2mm', page: 1 },
        { area: 'label', comment: 'Move to centre back', page: 2 },
      ],
    })

    // "Go to bulk and implement these changes" — it cuts, and the cutter sees what is
    // outstanding.
    expect(result.ppGateOpen).toBe(true)

    const gate = await checkPpApprovalFor(ctx, { orderId, orderStyleId })
    expect(gate.passed).toBe(true)
    expect(gate.facts?.openComments).toBe(2)
  })

  it('a later rejection revokes an approval, and says so', async () => {
    await clearSamples()
    await db.execute(sql`delete from outbox where company_id = ${COMPANY}`)

    const sample = await newPp()
    await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-10',
    })
    const revoked = await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'rejected',
      recordedOn: '2026-07-20',
    })

    expect(revoked.ppGateOpen).toBe(false)

    const gate = await checkPpApprovalFor(ctx, { orderId, orderStyleId })
    expect(gate.passed).toBe(false)

    // Cutting may already have started against the approval that just went away.
    const rows = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from outbox
          where company_id = ${COMPANY} and event_name = 'sampling.pp_approval.revoked'`,
    )
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
    expect(Number((list[0] as { n: string }).n)).toBe(1)
  })

  it('a fit sample approval does not open the PP gate', async () => {
    await clearSamples()
    const fit = await createSampleRequest(ctx, {
      orderId,
      type: 'fit',
      styleCode: 'ST-100',
      requestNo: `FIT-${randomUUID().slice(0, 8)}`,
    })
    await recordFeedback(ctx, {
      sampleRequestId: fit.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-20',
    })

    const gate = await checkPpApprovalFor(ctx, { orderId, orderStyleId })
    expect(gate.passed).toBe(false)
    expect(gate.reasonKey).toBe('gates.pp_approval.no_sample')
  })
})

describe('1.4 · the blocking escalation', () => {
  it('escalates an unapproved PP inside the cutting window', async () => {
    await clearSamples()
    await db.delete(tnaMilestones).where(eq(tnaMilestones.orderId, orderId))
    await db.insert(tnaMilestones).values({
      companyId: COMPANY,
      orderId,
      name: 'cutting',
      plannedDate: '2026-08-03',
    })

    await newPp()

    const alerts = await ppBlockingAlerts(ctx, { today: TODAY }, POLICY)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.daysToCutting).toBe(4)
    expect(alerts[0]!.overdue).toBe(false)
  })

  it('goes quiet once PP is approved', async () => {
    await clearSamples()
    const sample = await newPp()
    await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-20',
    })

    const alerts = await ppBlockingAlerts(ctx, { today: TODAY }, POLICY)
    expect(alerts).toHaveLength(0)
  })

  it('flags an overdue cutting date as overdue, not as a reminder', async () => {
    await clearSamples()
    await db.delete(tnaMilestones).where(eq(tnaMilestones.orderId, orderId))
    await db.insert(tnaMilestones).values({
      companyId: COMPANY,
      orderId,
      name: 'cutting',
      plannedDate: '2026-07-27',
    })
    await newPp()

    const alerts = await ppBlockingAlerts(ctx, { today: TODAY }, POLICY)
    expect(alerts[0]!.overdue).toBe(true)
    expect(alerts[0]!.daysToCutting).toBe(-3)
  })
})

describe('1.4 · timeline', () => {
  it('tells the whole story of a sample', async () => {
    await clearSamples()
    const sample = await newPp({ dueDate: '2026-08-10' })

    await advanceStage(ctx, { sampleRequestId: sample.sampleRequestId, stage: 'pattern' })
    await advanceStage(ctx, { sampleRequestId: sample.sampleRequestId, stage: 'sewing' })
    await addSampleCost(ctx, { sampleRequestId: sample.sampleRequestId, amount: '900.00' })
    await advanceStage(ctx, { sampleRequestId: sample.sampleRequestId, stage: 'dispatched' })
    await dispatchSample(ctx, {
      sampleRequestId: sample.sampleRequestId,
      courier: 'DHL',
      awb: 'AWB-77',
    })
    await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-25',
    })

    const timeline = await sampleTimeline(ctx, sample.sampleRequestId)
    expect(timeline.stages).toHaveLength(3)
    expect(timeline.dispatches[0]!.awb).toBe('AWB-77')
    expect(timeline.rounds).toHaveLength(1)
    expect(timeline.totalCost).toBe('900.00')
    expect(timeline.request.status).toBe('approved')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The headline: 1.4 makes 5.1 work
// ─────────────────────────────────────────────────────────────────────────────

describe('1.4 → 5.1 · cutting becomes possible', () => {
  const layInput = () => ({
    orderId,
    orderStyleId,
    markerId,
    layNo: `LAY-${randomUUID().slice(0, 8)}`,
    color: 'Black',
    plies: 100,
    layLengthMeters: '6.40',
    rollsDrawn: rollIds,
  })

  it('blocks cutting while the PP sample is unapproved', async () => {
    await clearSamples()
    await newPp()

    // The provider is registered and answering — this is a real refusal, not the
    // fail-closed default.
    await expect(createLay(cutCtx, layInput())).rejects.toThrow(/awaiting_feedback/)
  })

  it('lets the floor cut once the buyer approves', async () => {
    await clearSamples()
    const sample = await newPp()
    await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-20',
    })

    const lay = await createLay(cutCtx, layInput())
    expect(lay.expectedPerSize).toEqual({ S: 100, M: 200, L: 100 })
  })

  it('blocks again the moment a later round rejects', async () => {
    await clearSamples()
    const sample = await newPp()
    await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'approved',
      recordedOn: '2026-07-10',
    })
    await createLay(cutCtx, layInput())

    await recordFeedback(ctx, {
      sampleRequestId: sample.sampleRequestId,
      verdict: 'rejected',
      recordedOn: '2026-07-20',
    })

    await expect(createLay(cutCtx, layInput())).rejects.toThrow(/rejected/)
  })

  it('seedApprovedPpSample makes a fresh factory demoable', async () => {
    await clearSamples()
    // The demo path: a REAL approval, not a bypass. The gate passes because the factory
    // genuinely has one.
    await seedApprovedPpSample(ctx, { orderId, styleCode: 'ST-100' })

    const lay = await createLay(cutCtx, layInput())
    expect(lay.plannedFabric).toBe('640.00')

    const gate = await checkPpApprovalFor(ctx, { orderId, orderStyleId })
    expect(gate.facts?.verdict).toBe('approved')
  })
})

describe('1.4 · tenancy', () => {
  it('another company sees no sample requests', async () => {
    await clearSamples()
    await newPp()

    const rows = await withTenantRead(otherCtx, async (tx) => tx.select().from(sampleRequests))
    expect(rows).toHaveLength(0)
  })

  it('another company cannot raise a sample against this factory’s order', async () => {
    await clearSamples()
    // Postgres runs foreign-key checks with RLS BYPASSED, so the FK alone would happily
    // let another tenant reference this order — and knowing whether the insert succeeded
    // tells them the id exists. The service checks ownership under tenant scope instead.
    await expect(
      createSampleRequest(otherCtx, {
        orderId,
        type: 'pp',
        styleCode: 'ST-100',
        requestNo: `X-${randomUUID().slice(0, 8)}`,
      }),
    ).rejects.toThrow(/order_not_found/)

    const gate = await checkPpApprovalFor(ctx, { orderId, orderStyleId })
    expect(gate.passed).toBe(false)
  })
})
