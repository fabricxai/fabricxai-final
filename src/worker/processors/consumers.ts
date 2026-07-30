/**
 * Event consumers — the bridge between modules that were built to fit and never connected.
 *
 * Until now every module emitted its outbox events and nothing listened. Each pair below
 * was built from both ends: one module emits a payload shaped exactly as the other's entry
 * point expects, and the two halves were tested independently. This file is the wire.
 *
 * Three rules govern everything here:
 *
 *  1. **Every handler is independently idempotent.** A queue redelivers, and
 *     `processed_events` is a fast path rather than the guarantee — see the note on
 *     `runEventConsumer` for exactly which window it does and does not close. These
 *     handlers write money, so re-running one must be a no-op on its own terms.
 *  2. **A missing counterpart is not a failure.** A `finance.realized` for a shipment with
 *     no invoice yet is a sequencing gap, not an error: retrying it five times and then
 *     alerting somebody at 3am teaches people to ignore the alerts. It is logged and
 *     marked processed.
 *  3. **The consumer never invents context.** It runs as a system actor scoped to the
 *     event's own company, and calls the owning module's service — it does not write
 *     another module's tables itself (CLAUDE.md rule 11).
 */
import type { Job } from 'bullmq'
import { and, eq } from 'drizzle-orm'

import { processedEvents } from '@/db/schema/core'
import type { SystemCtx } from '@/modules/core/ctx'
import { isAppError } from '@/modules/core/errors'
import { markProcessed } from '@/modules/core/outbox'
import { withTenantRead, withTenantTx } from '@/modules/core/tenancy'

import { QUEUE } from '../queues'

export interface EventJobData {
  eventId: string
  companyId: string
  payload: Record<string, unknown>
}

/**
 * The actor a consumer runs as: a system context scoped to the company on the event.
 *
 * `roles: ['owner']` is broader than it should be. It matches what the scheduler already
 * does, and there is no `system` role to narrow it to — adding one means auditing every
 * role check in the repo, which is not this commit. Logged in docs/STUBS.md. Two things
 * limit the blast radius meanwhile: the context is company-scoped so RLS binds it exactly
 * as it binds a request, and `userId` is null so nothing it writes is attributed to a
 * person who did not do it.
 */
function systemCtx(companyId: string): SystemCtx {
  return { companyId, userId: null, roles: ['owner'], system: true }
}

type Handler = (ctx: SystemCtx, payload: Record<string, unknown>) => Promise<void>

/** A counterpart that is not there yet. Logged and swallowed — see rule 2 above. */
class NotReadyYet extends Error {
  override readonly name = 'NotReadyYet'
}

const notReady = (reason: string): never => {
  throw new NotReadyYet(reason)
}

// ─────────────────────────────────────────────────────────────────────────────
// The handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 8.1 handed its document set to the bank → 2.1 opens the presentation.
 *
 * The EXP gate has already passed by the time this event exists — 8.1 refuses the handoff
 * without it — so this consumer does not re-check it. What it does is give the commercial
 * desk a row to track the bank's response against.
 */
const onDocsReadyForBank: Handler = async (ctx, payload) => {
  const shipmentId = String(payload.shipmentId ?? '')
  if (!shipmentId) notReady('event carries no shipmentId')

  const { shipments } = await import('@/modules/shipment/schema')
  const { docSubmissions } = await import('@/modules/commercial/schema')
  const { openSubmission } = await import('@/modules/commercial/service')
  const { withTenantRead } = await import('@/modules/core/tenancy')

  const existing = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({ id: docSubmissions.id })
      .from(docSubmissions)
      .where(eq(docSubmissions.shipmentId, shipmentId))
    return row
  })

  // A second event for the same shipment — a re-presentation — reuses the row, because the
  // bank treats it as the same presentation.
  if (existing) return

  const shipment = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    return row
  })

  if (!shipment) notReady(`shipment ${shipmentId} not visible`)
  if (!shipment!.lcId) notReady(`shipment ${shipmentId} has no LC to present against`)

  // The invoice value, if 11.1 has raised one. A presentation can be opened without it and
  // have it filled in later; refusing here would leave the commercial desk with nothing to
  // track while they chase the invoice.
  const { invoices } = await import('@/modules/finance/schema')
  const invoiced = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({ value: invoices.value, currency: invoices.currency })
      .from(invoices)
      .where(eq(invoices.shipmentId, shipmentId))
    return row
  })

  await openSubmission(ctx, {
    lcId: shipment!.lcId!,
    shipmentId,
    docs: Array.isArray(payload.kinds)
      ? (payload.kinds as string[]).map((kind) => ({ kind, status: 'submitted' }))
      : [],
    invoicedAmount: invoiced?.value,
    currency: invoiced?.currency ?? 'USD',
  })
}

/**
 * 2.1 posted a realization → 11.1 closes the receivable.
 *
 * The payload carries BOTH the invoiced and realized amounts, because the difference is what
 * the bank kept and the receivable has to record it rather than closing at the invoice value.
 */
const onFinanceRealized: Handler = async (ctx, payload) => {
  const shipmentId = payload.shipmentId ? String(payload.shipmentId) : null
  if (!shipmentId) notReady('realization carries no shipmentId')

  const { invoices } = await import('@/modules/finance/schema')
  const { postRealizationToReceivable } = await import('@/modules/finance/service')
  const { withTenantRead } = await import('@/modules/core/tenancy')

  const invoice = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.shipmentId, shipmentId!))
    return row
  })

  // No invoice raised for this shipment yet. A sequencing gap, not an error.
  if (!invoice) notReady(`no invoice for shipment ${shipmentId}`)

  await postRealizationToReceivable(ctx, {
    invoiceId: invoice!.id,
    submissionId: payload.submissionId ? String(payload.submissionId) : undefined,
    realizedAmount: String(payload.realizedAmount),
    realizedAt: String(payload.realizedAt),
  })
}

/**
 * 5.1 finished cutting a style → 1.3 actualises the cutting milestone.
 *
 * The milestone is actualised on the date the event says, not on today: a day-close that
 * runs late must not record the cutting as having finished when the job happened to run.
 */
const onCuttingComplete: Handler = async (ctx, payload) => {
  const orderId = String(payload.orderId ?? '')
  if (!orderId) notReady('event carries no orderId')

  await actualiseMilestone(ctx, {
    orderId,
    name: 'cutting',
    on: typeof payload.completedOn === 'string' ? payload.completedOn : todayInFactoryTz(),
  })
}

/** 8.1 confirmed ex-factory → 1.3 actualises the shipment milestone. */
const onExFactoryConfirmed: Handler = async (ctx, payload) => {
  const orderId = String(payload.orderId ?? '')
  if (!orderId) notReady('event carries no orderId')

  await actualiseMilestone(ctx, {
    orderId,
    name: 'ex_factory',
    on: String(payload.actualExFactory ?? todayInFactoryTz()),
  })
}

/**
 * Mark a TNA milestone actual, through 1.3's own operation.
 *
 * This used to write `tna_milestones` directly, which was wrong twice over: it broke rule
 * 11, and — much worse — it skipped the RIPPLE. `actualizeMilestone` reschedules everything
 * downstream of a slip in the same transaction, so a cut that finished six days late moved
 * the sewing and shipping dates with it. The direct write recorded the actual date and left
 * the rest of the calendar claiming the order was still on time.
 */
async function actualiseMilestone(
  ctx: SystemCtx,
  input: { orderId: string; name: string; on: string },
): Promise<void> {
  const { actualizeMilestone, findMilestone } = await import('@/modules/orders/service')

  const milestone = await findMilestone(ctx, { orderId: input.orderId, name: input.name })
  // No such milestone on this order. Some orders have no TNA, and that is not this
  // consumer's problem to solve.
  if (!milestone) return
  // Already actual. A redelivery must not move a date somebody has since corrected —
  // `actualizeMilestone` would throw, so the check is here rather than as a caught error.
  if (milestone.actualDate) return

  await actualizeMilestone(ctx, { milestoneId: milestone.id, actualDate: input.on })
}

/**
 * 1.2 won an RFQ → 1.3 creates the order.
 *
 * The last wire in the chain, and the one that closes the loop from enquiry to production.
 * `wonPayload` already refused anything an order cannot be created from — no size ratio, no
 * requested ship date — so by the time this event exists the payload is complete.
 *
 * Idempotent on the RFQ: a redelivery finds the order already carrying this `rfqId` and
 * returns. Creating a second order for one win would double the factory's committed
 * capacity against a single buyer commitment.
 */
const onRfqWon: Handler = async (ctx, payload) => {
  const rfqId = String(payload.rfqId ?? '')
  if (!rfqId) notReady('win carries no rfqId')

  const { createOrder } = await import('@/modules/orders/service')
  const { orders } = await import('@/modules/orders/schema')
  const { rfqs } = await import('@/modules/rfq/schema')

  const existing = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.sourceRfqId, rfqId))
    return row
  })

  // Already created. Two orders for one win would double the committed capacity.
  if (existing) return

  const rfq = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx.select().from(rfqs).where(eq(rfqs.id, rfqId))
    return row
  })
  if (!rfq) notReady(`RFQ ${rfqId} not visible`)

  const quantity = Number(payload.quantity)
  if (!Number.isInteger(quantity) || quantity <= 0) {
    notReady(`win for RFQ ${rfqId} carries no usable quantity`)
  }

  const created = await createOrder(ctx, {
    sourceRfqId: rfqId,
    order: {
      buyerId: String(payload.buyerId),
      // The PO number arrives with the buyer's actual purchase order. Until then the RFQ
      // is what the order is known by — a placeholder here would look like a real PO
      // number on a document.
      poNumbers: [`RFQ-${rfq!.title}`.slice(0, 60)],
      currency: String(payload.currency ?? 'USD'),
      plannedExFactoryDate: String(payload.requestedShipDate),
      ownerUserId: rfq!.ownerUserId ?? undefined,
    },
    styles: [
      {
        styleCode: String(payload.styleCode),
        contractedQty: quantity,
        unitPrice: String(payload.fobPrice),
        currency: String(payload.currency ?? 'USD'),
      },
    ],
  })

  // ── The calendar ──
  //
  // Generated here rather than left to a merchandiser, because an order with no schedule is
  // an order nothing downstream has a date to be late against: 1.4's PP escalation, 7.1's
  // pre-final readiness and 8.1's LC countdown all read milestones by name.
  //
  // A product type with no template does NOT get one invented. Falling back to the shortest
  // calendar would give a jacket a 90-day schedule and a ship date that was wrong from the
  // day it was created. The order still exists and is usable; only the schedule is missing,
  // and that is a visible gap rather than a silently wrong one.
  const { findTemplateForProductType, generateTna } = await import('@/modules/orders/service')
  const template = await findTemplateForProductType(ctx, { productType: rfq!.productType })

  if (!template) {
    console.warn(
      `[consumer] rfq.won: order ${created.orderId} created without a TNA — ` +
        `no template for product type "${rfq!.productType}"`,
    )
    return
  }

  await generateTna(ctx, {
    orderId: created.orderId,
    templateId: template.id,
    exFactoryDate: String(payload.requestedShipDate),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The routing table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event name → handler.
 *
 * An event with no handler is not an error: most events exist so somebody can be notified,
 * and only the ones that cause another module to WRITE need a consumer here.
 */
export const EVENT_HANDLERS: Readonly<Record<string, Handler>> = {
  'shipment.docs.ready_for_bank': onDocsReadyForBank,
  'finance.realized': onFinanceRealized,
  'cutting.order.complete': onCuttingComplete,
  'shipment.ex_factory.confirmed': onExFactoryConfirmed,
  'rfq.won': onRfqWon,
}

/**
 * The `derive` queue's consumer entry point.
 *
 * **Where the idempotency actually lives.** `processed_events` is checked first and written
 * last, which leaves a window: a crash after the handler commits but before the mark means a
 * redelivery re-runs the handler. That window is safe because every handler above is
 * independently idempotent — `openSubmission` returns early on an existing presentation,
 * `postRealizationToReceivable` refuses a settled receivable, `actualiseMilestone` refuses a
 * milestone that already has a date.
 *
 * The alternative — marking first — would close that window and open a worse one: a crash
 * between the mark and the work drops the event permanently, and these handlers write money.
 * Doing the work twice is recoverable; not doing it at all is not.
 */
export async function runEventConsumer(job: Job<EventJobData>): Promise<void> {
  const handler = EVENT_HANDLERS[job.name]
  if (!handler) return

  const ctx = systemCtx(job.data.companyId)

  const alreadyDone = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({ eventId: processedEvents.eventId })
      .from(processedEvents)
      .where(
        and(eq(processedEvents.eventId, job.data.eventId), eq(processedEvents.queue, QUEUE.derive)),
      )
    return row
  })
  if (alreadyDone) return

  try {
    await handler(ctx, job.data.payload ?? {})
  } catch (error) {
    if (error instanceof NotReadyYet) {
      // A counterpart that does not exist yet. Retrying would fail identically five times
      // and then page somebody about a sequencing gap. Marked so it does not come back.
      console.warn(`[consumer] ${job.name} skipped: ${error.message}`)
      await withTenantTx(ctx, (tx) => markProcessed(tx, job.data.eventId, QUEUE.derive))
      return
    }

    if (isAppError(error)) {
      console.error(`[consumer] ${job.name} failed: ${error.code} ${error.messageKey}`)
    }
    // Not marked: BullMQ retries, and the handler's own idempotency absorbs a partial
    // first attempt.
    throw error
  }

  await withTenantTx(ctx, (tx) => markProcessed(tx, job.data.eventId, QUEUE.derive))
}

/** The factory's today. Milestones are calendar days, in the factory's timezone. */
function todayInFactoryTz(timeZone = 'Asia/Dhaka'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
