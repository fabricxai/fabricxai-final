/**
 * Event consumers — the wires between modules, end to end.
 *
 * Every pair here was built from both ends and never connected: 8.1 emitted a payload
 * shaped exactly as 2.1's entry point expects, 2.1 emitted one shaped for 11.1's, and
 * nothing carried them. These tests drive the real handlers against real rows.
 *
 * What is asserted:
 *
 *  - a shipment's bank handoff opens a presentation in 2.1;
 *  - a realization posted in 2.1 closes the receivable in 11.1, keeping the shortfall;
 *  - a completed cut and a confirmed departure actualise the RIGHT TNA milestone;
 *  - a redelivery is a no-op, because every handler is independently idempotent;
 *  - a missing counterpart is skipped rather than retried into an alert.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, processedEvents, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import '@/modules/commercial/register'
import { docSubmissions, lcs } from '@/modules/commercial/schema'
import { postRealization, setSubmissionStatus } from '@/modules/commercial/service'
import type { RequestCtx } from '@/modules/core/ctx'
import '@/modules/finance/register'
import { invoices, receivables } from '@/modules/finance/schema'
import { draftInvoice } from '@/modules/finance/service'
import { orders, tnaMilestones } from '@/modules/orders/schema'
import '@/modules/shipment/register'
import { shipments } from '@/modules/shipment/schema'
import { EVENT_HANDLERS, runEventConsumer, type EventJobData } from '@/worker/processors/consumers'
import { QUEUE } from '@/worker/queues'

import type { Job } from 'bullmq'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const USER = `con-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['owner'] }

const FINANCE_POLICY = { defaultRealizationLagDays: 30 }
const BANK_POLICY = { discrepancyEscalateAfterDays: 5, explainShortfallAbovePct: '5' }

let buyerId: string
let orderId: string
let lcId: string

/** Drive a handler exactly as the worker would. */
const deliver = (eventName: string, payload: Record<string, unknown>, eventId = randomUUID()) =>
  runEventConsumer({
    name: eventName,
    data: { eventId, companyId: COMPANY, payload } satisfies EventJobData,
  } as Job<EventJobData>)

beforeAll(async () => {
  await db
    .insert(companies)
    .values({ id: COMPANY, name: 'Wire Co', slug: `wire-${COMPANY.slice(0, 8)}` })
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Wire' })

  const [buyer] = await db
    .insert(buyers)
    .values({ companyId: COMPANY, code: 'HM', name: 'H&M' })
    .returning({ id: buyers.id })
  buyerId = buyer!.id

  const [order] = await db
    .insert(orders)
    .values({ companyId: COMPANY, buyerId, poNumbers: ['PO-1'], createdBy: USER })
    .returning({ id: orders.id })
  orderId = order!.id

  const [lc] = await db
    .insert(lcs)
    .values({
      companyId: COMPANY,
      buyerId,
      number: `LC-${randomUUID().slice(0, 8)}`,
      value: '100000.00',
      currency: 'USD',
      status: 'active',
      createdBy: USER,
    })
    .returning({ id: lcs.id })
  lcId = lc!.id
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id = ${COMPANY}`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

const reset = async () => {
  await db.delete(receivables).where(eq(receivables.companyId, COMPANY))
  await db.delete(invoices).where(eq(invoices.companyId, COMPANY))
  await db.delete(docSubmissions).where(eq(docSubmissions.companyId, COMPANY))
  await db.delete(shipments).where(eq(shipments.companyId, COMPANY))
  await db.delete(tnaMilestones).where(eq(tnaMilestones.companyId, COMPANY))
}

const newShipment = async () => {
  const [row] = await db
    .insert(shipments)
    .values({
      companyId: COMPANY,
      orderId,
      lcId,
      partialNo: Math.floor(Math.random() * 100000) + 1,
      plannedExFactory: '2026-08-10',
      expNumber: 'EXP-2026-0001',
      createdBy: USER,
    })
    .returning({ id: shipments.id })
  return row!.id
}

describe('the routing table', () => {
  it('has a handler for every wire this commit claims to connect', () => {
    expect(Object.keys(EVENT_HANDLERS).sort()).toEqual([
      'cutting.order.complete',
      'finance.realized',
      'shipment.docs.ready_for_bank',
      'shipment.ex_factory.confirmed',
    ])
  })

  it('ignores an event nobody consumes', async () => {
    // Most events exist so somebody can be notified. An unhandled one is not an error.
    await expect(deliver('planning.allocation.created', { orderId })).resolves.toBeUndefined()
  })
})

describe('8.1 → 2.1 · the bank handoff opens a presentation', () => {
  it('opens one carrying the document kinds and the invoice value', async () => {
    await reset()
    const shipmentId = await newShipment()
    await draftInvoice(
      ctx,
      {
        orderId,
        shipmentId,
        number: `INV-${randomUUID().slice(0, 8)}`,
        invoiceDate: '2026-08-01',
        value: '50000.00',
        currency: 'USD',
      },
      FINANCE_POLICY,
    )

    await deliver('shipment.docs.ready_for_bank', {
      shipmentId,
      orderId,
      expNumber: 'EXP-2026-0001',
      kinds: ['commercial_invoice', 'bl'],
    })

    const [submission] = await db
      .select()
      .from(docSubmissions)
      .where(eq(docSubmissions.shipmentId, shipmentId))

    expect(submission).toBeDefined()
    expect(submission!.lcId).toBe(lcId)
    // The invoice value came from 11.1 rather than being left null.
    expect(submission!.invoicedAmount).toBe('50000.00')
    expect((submission!.docs as { kind: string }[]).map((d) => d.kind)).toEqual([
      'commercial_invoice',
      'bl',
    ])
  })

  it('a redelivery does not open a second presentation', async () => {
    await reset()
    const shipmentId = await newShipment()
    const eventId = randomUUID()

    await deliver('shipment.docs.ready_for_bank', { shipmentId, kinds: ['bl'] }, eventId)
    // Same event id: caught by processed_events.
    await deliver('shipment.docs.ready_for_bank', { shipmentId, kinds: ['bl'] }, eventId)
    // A DIFFERENT event id for the same shipment — a re-presentation. Caught by the
    // handler's own idempotency, which is the guarantee that actually matters.
    await deliver('shipment.docs.ready_for_bank', { shipmentId, kinds: ['bl'] })

    const rows = await db
      .select()
      .from(docSubmissions)
      .where(eq(docSubmissions.shipmentId, shipmentId))
    expect(rows).toHaveLength(1)
  })

  it('skips a shipment with no LC rather than retrying into an alert', async () => {
    await reset()
    const [row] = await db
      .insert(shipments)
      .values({
        companyId: COMPANY,
        orderId,
        partialNo: 999,
        plannedExFactory: '2026-08-10',
        createdBy: USER,
      })
      .returning({ id: shipments.id })

    const eventId = randomUUID()
    await expect(
      deliver('shipment.docs.ready_for_bank', { shipmentId: row!.id }, eventId),
    ).resolves.toBeUndefined()

    // Marked processed so it does not come back every retry.
    const marked = await db
      .select()
      .from(processedEvents)
      .where(and(eq(processedEvents.eventId, eventId), eq(processedEvents.queue, QUEUE.derive)))
    expect(marked).toHaveLength(1)
  })
})

describe('2.1 → 11.1 · a realization closes the receivable', () => {
  it('carries the shortfall through, rather than closing at the invoice value', async () => {
    await reset()
    const shipmentId = await newShipment()
    const drafted = await draftInvoice(
      ctx,
      {
        orderId,
        shipmentId,
        number: `INV-${randomUUID().slice(0, 8)}`,
        invoiceDate: '2026-08-01',
        value: '50000.00',
        currency: 'USD',
      },
      FINANCE_POLICY,
    )

    // The real 2.1 path, so the payload is the one that module actually emits.
    const { submissionId } = await (
      await import('@/modules/commercial/service')
    ).openSubmission(ctx, {
      lcId,
      shipmentId,
      docs: [],
      invoicedAmount: '50000.00',
      currency: 'USD',
    })
    await setSubmissionStatus(ctx, {
      submissionId,
      bankStatus: 'submitted',
      submittedAt: '2026-08-05',
    })
    await setSubmissionStatus(ctx, { submissionId, bankStatus: 'accepted' })
    await postRealization(
      ctx,
      { submissionId, realizedAmount: '49250.00', realizedAt: '2026-08-20' },
      BANK_POLICY,
    )

    // The event 2.1 emitted, delivered as the relay would.
    const emitted = await db.execute<{ payload: Record<string, unknown> }>(
      sql`select payload from outbox
          where company_id = ${COMPANY} and event_name = 'finance.realized'
          order by occurred_at desc limit 1`,
    )
    const list = Array.isArray(emitted) ? emitted : ((emitted as { rows?: unknown[] }).rows ?? [])
    const payload = (list[0] as { payload: Record<string, unknown> }).payload

    await deliver('finance.realized', payload)

    const [receivable] = await db
      .select()
      .from(receivables)
      .where(eq(receivables.invoiceId, drafted.invoiceId))

    expect(receivable!.status).toBe('realized')
    expect(receivable!.realizedAmount).toBe('49250.00')
    // The $750 the bank kept. A receivable closed at the invoice value would lose it.
    expect(receivable!.shortfall).toBe('750.00')
  })

  it('skips a realization for a shipment with no invoice yet', async () => {
    await reset()
    const shipmentId = await newShipment()

    // A sequencing gap, not an error: retrying five times then paging somebody at 3am
    // teaches people to ignore the alerts.
    await expect(
      deliver('finance.realized', {
        shipmentId,
        realizedAmount: '1000.00',
        realizedAt: '2026-08-20',
      }),
    ).resolves.toBeUndefined()
  })

  it('a redelivery does not settle the receivable twice', async () => {
    await reset()
    const shipmentId = await newShipment()
    const drafted = await draftInvoice(
      ctx,
      {
        orderId,
        shipmentId,
        number: `INV-${randomUUID().slice(0, 8)}`,
        invoiceDate: '2026-08-01',
        value: '50000.00',
        currency: 'USD',
      },
      FINANCE_POLICY,
    )

    const payload = {
      shipmentId,
      realizedAmount: '49250.00',
      realizedAt: '2026-08-20',
    }

    await deliver('finance.realized', payload)
    // A different event id, so processed_events does not catch it — the handler's own
    // refusal to re-settle is what has to hold.
    await expect(deliver('finance.realized', payload)).rejects.toThrow(/already_settled/)

    const [receivable] = await db
      .select()
      .from(receivables)
      .where(eq(receivables.invoiceId, drafted.invoiceId))
    expect(receivable!.realizedAmount).toBe('49250.00')
  })
})

describe('→ 1.3 · milestones actualise', () => {
  const milestone = (name: string, plannedDate: string) =>
    db.insert(tnaMilestones).values({ companyId: COMPANY, orderId, name, plannedDate })

  it('actualises the RIGHT milestone when an order has several', async () => {
    await reset()
    // `ex_factory` is inserted FIRST on purpose: a handler that matched on order alone
    // would take whichever row came back first, so putting the wrong one there is what
    // makes this test able to fail.
    await milestone('ex_factory', '2026-09-01')
    await milestone('cutting', '2026-08-01')
    await milestone('sewing', '2026-08-15')

    await deliver('cutting.order.complete', { orderId, completedOn: '2026-08-03' })

    const rows = await db.select().from(tnaMilestones).where(eq(tnaMilestones.orderId, orderId))
    const cutting = rows.find((r) => r.name === 'cutting')!
    const shipment = rows.find((r) => r.name === 'ex_factory')!

    expect(cutting.actualDate).toBe('2026-08-03')
    expect(cutting.status).toBe('done')
    // Untouched. Selecting by order alone would have hit whichever row came back first.
    expect(shipment.actualDate).toBeNull()
    expect(rows.find((r) => r.name === 'sewing')!.actualDate).toBeNull()
  })

  it('uses the date on the event, not the day the job happened to run', async () => {
    await reset()
    await milestone('ex_factory', '2026-09-01')

    await deliver('shipment.ex_factory.confirmed', { orderId, actualExFactory: '2026-08-28' })

    const [row] = await db
      .select()
      .from(tnaMilestones)
      .where(and(eq(tnaMilestones.orderId, orderId), eq(tnaMilestones.name, 'ex_factory')))
    expect(row!.actualDate).toBe('2026-08-28')
  })

  it('does not move a date somebody has since corrected', async () => {
    await reset()
    await milestone('cutting', '2026-08-01')

    await deliver('cutting.order.complete', { orderId, completedOn: '2026-08-03' })
    // A redelivery with a different date must not overwrite the recorded actual.
    await deliver('cutting.order.complete', { orderId, completedOn: '2026-08-09' })

    const [row] = await db
      .select()
      .from(tnaMilestones)
      .where(and(eq(tnaMilestones.orderId, orderId), eq(tnaMilestones.name, 'cutting')))
    expect(row!.actualDate).toBe('2026-08-03')
  })

  it('is a no-op when the order has no such milestone', async () => {
    await reset()
    await expect(
      deliver('cutting.order.complete', { orderId, completedOn: '2026-08-03' }),
    ).resolves.toBeUndefined()
  })
})
