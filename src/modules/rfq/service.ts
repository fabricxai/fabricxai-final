/**
 * 1.2 RFQ & Quotation — service layer ⚖
 *
 * Two things here decide money.
 *
 * **`draftQuote` requires an APPROVED cost sheet** and snapshots it. The brief says so, and
 * the reason is that a quote built from a draft sheet is a price nobody signed off — and one
 * that points at a sheet rather than freezing it is a price that changes under the buyer.
 *
 * **Sending below the margin floor needs a manager.** Same shape as costing's own
 * below-floor rule and for the same reason: quoting under the floor is how a factory books
 * a year of loss-making work, one defensible-looking quote at a time. The floor is checked
 * against the ACHIEVED margin computed from the snapshot, not against the margin the sheet
 * claims.
 */
import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm'

import { recordChange, registerAuditedTables } from '../core/audit'
import type { AnyCtx, RequestCtx } from '../core/ctx'
import { AppError, conflict, notFound } from '../core/errors'
import { emit } from '../core/outbox'
import { withTenantRead, withTenantTx, type TenantDb } from '../core/tenancy'

import { RFQ_EVENTS } from './events'
import {
  buildFobBreakdown,
  isQuoteExpired,
  RfqError,
  rfqStatusMachine,
  wonPayload,
  type CostSheetSnapshot,
  type RfqStatus,
} from './rfq'
import { lossReasons, quotes, rfqClarifications, rfqs } from './schema'
import { clarificationPayload, rfqPayload, type RfqPayload } from './zod'

/** ⚖ — a quote is the price a year of work gets booked at. */
registerAuditedTables('quotes')

/** Company policy. Owned by Settings (X.3); passed in until that module exists. */
export interface RfqPolicy {
  /** Achieved margin below this needs a manager to send. */
  marginFloorPct?: string
  /** Hours before a deadline at which the reminder fires. Brief says 48. */
  deadlineNearHours: number
  /** Days an unanswered clarification may sit. Brief says 5. */
  clarificationStaleDays: number
}

function wrapRfqError<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof RfqError) {
      throw new AppError('validation_failed', 'rfq.errors.invalid', { reason: error.message })
    }
    throw error
  }
}

export async function createRfq(ctx: RequestCtx, input: unknown): Promise<{ rfqId: string }> {
  const payload = rfqPayload.parse(input)
  return withTenantTx(ctx, async (tx) => ({ rfqId: (await commitRfq(ctx, tx, { payload })).rowId }))
}

/**
 * Create an RFQ inside a caller's transaction.
 *
 * Registered as the commit handler for `rfqs`, which is what an approved MARBIM draft of a
 * buyer enquiry lands through. Without it, core's generic single-row write would insert
 * straight into the table — skipping the buyer's tenant-scoped existence check and, more
 * importantly, the `rfq.created` outbox event, so a won enquiry would never have started a
 * quote. `createRfq` routes through here too, so the two paths cannot drift.
 */
export async function commitRfq(
  ctx: AnyCtx,
  tx: TenantDb,
  input: { payload: Record<string, unknown> | RfqPayload },
): Promise<{ rowId: string; after: Record<string, unknown> }> {
  // Re-parsed rather than trusted: a draft written weeks ago is validated against the schema
  // as it stands today (PLAYBOOK §3), and `createRfq` has already parsed the same shape.
  const payload = rfqPayload.parse(input.payload)

  const { buyers } = await import('@/modules/buyers/schema')
  const [buyer] = await tx
    .select({ id: buyers.id })
    .from(buyers)
    .where(eq(buyers.id, payload.buyerId))
  // Read under tenant scope BEFORE the insert. Postgres runs FK checks with RLS bypassed,
  // so the foreign key alone would happily accept another factory's buyer id.
  if (!buyer) throw notFound('rfq.errors.buyer_not_found', { buyerId: payload.buyerId })

  const [row] = await tx
    .insert(rfqs)
    .values({
      companyId: ctx.companyId,
      buyerId: payload.buyerId,
      title: payload.title,
      productType: payload.productType,
      description: payload.description ?? null,
      styleCode: payload.styleCode ?? null,
      quantity: payload.quantity,
      unit: payload.unit,
      sizeRatio: payload.sizeRatio,
      targetPrice: payload.targetPrice ?? null,
      targetCurrency: payload.targetCurrency ?? null,
      currency: payload.currency,
      deadline: payload.deadline ?? null,
      requestedShipDate: payload.requestedShipDate ?? null,
      source: payload.source,
      ownerUserId: payload.ownerUserId ?? ctx.userId,
      createdBy: ctx.userId,
    })
    .returning({ id: rfqs.id })

  if (!row) throw new Error('rfqs insert returned nothing')

  await emit(ctx, tx, {
    eventName: RFQ_EVENTS.created,
    payload: { rfqId: row.id, buyerId: payload.buyerId, deadline: payload.deadline ?? null },
    aggregateTable: 'rfqs',
    aggregateId: row.id,
  })

  return { rowId: row.id, after: { rfqId: row.id, buyerId: payload.buyerId, title: payload.title } }
}

export async function askClarification(
  ctx: RequestCtx,
  input: unknown,
): Promise<{ clarificationId: string }> {
  const payload = clarificationPayload.parse(input)

  return withTenantTx(ctx, async (tx) => {
    const [rfq] = await tx.select().from(rfqs).where(eq(rfqs.id, payload.rfqId)).for('update')
    if (!rfq) throw notFound('rfq.errors.not_found', { rfqId: payload.rfqId })

    const [row] = await tx
      .insert(rfqClarifications)
      .values({
        companyId: ctx.companyId,
        rfqId: payload.rfqId,
        question: payload.question,
        askedAt: payload.askedAt,
        createdBy: ctx.userId,
      })
      .returning({ id: rfqClarifications.id })

    if (!row) throw new Error('rfq_clarifications insert returned nothing')

    // Asking a question moves the RFQ, so the pipeline shows what is actually blocking it.
    if (rfq.status === 'open' || rfq.status === 'quoted') {
      rfqStatusMachine.assert(rfq.status as RfqStatus, 'clarifying')
      await tx
        .update(rfqs)
        .set({ status: 'clarifying', updatedAt: new Date() })
        .where(eq(rfqs.id, rfq.id))
    }

    return { clarificationId: row.id }
  })
}

export async function answerClarification(
  ctx: RequestCtx,
  input: { clarificationId: string; answer: string; answeredAt: string },
): Promise<void> {
  await withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(rfqClarifications)
      .where(eq(rfqClarifications.id, input.clarificationId))
      .for('update')

    if (!row) {
      throw notFound('rfq.errors.clarification_not_found', {
        clarificationId: input.clarificationId,
      })
    }
    if (row.answeredAt) {
      throw conflict('rfq.errors.clarification_already_answered', { clarificationId: row.id })
    }

    await tx
      .update(rfqClarifications)
      .set({ answer: input.answer, answeredAt: input.answeredAt })
      .where(eq(rfqClarifications.id, row.id))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Quoting
// ─────────────────────────────────────────────────────────────────────────────

export interface DraftQuoteResult {
  quoteId: string
  version: number
  fobPrice: string
  achievedMarginPct: string
  belowFloor: boolean
  supersededCount: number
}

/**
 * Draft a quote from an approved cost sheet (brief: "requires approved cost sheet; computes
 * fob_breakdown; new version supersedes prior").
 *
 * The sheet is read through 1.5's own surface (rule 11) and FROZEN onto the quote. A quote
 * that pointed at the sheet would change every time the sheet was repriced, and the buyer
 * would be holding a different number from the one the system reports.
 */
export async function draftQuote(
  ctx: RequestCtx,
  input: { rfqId: string; styleCode: string; validityDate?: string },
  policy: RfqPolicy,
): Promise<DraftQuoteResult> {
  return withTenantTx(ctx, async (tx) => {
    const [rfq] = await tx.select().from(rfqs).where(eq(rfqs.id, input.rfqId)).for('update')
    if (!rfq) throw notFound('rfq.errors.not_found', { rfqId: input.rfqId })

    rfqStatusMachine.assert(rfq.status as RfqStatus, 'quoted')

    // `getApprovedSheet` throws when there is no approved sheet — a quote built from a
    // draft is a price nobody signed off.
    const { getApprovedSheet } = await import('../costing/service')
    const sheet = await getApprovedSheet(ctx, input.styleCode)

    const sections = sheet.sections as {
      marginBasis?: 'price' | 'cost'
      fabric?: { consumption: string; ratePerUom: string }[]
      trims?: { consumption: string; ratePerUom: string }[]
      embellishment?: { costPerPiece: string }[]
    }

    if (sections.marginBasis !== 'price' && sections.marginBasis !== 'cost') {
      throw new AppError('validation_failed', 'rfq.errors.sheet_has_no_margin_basis', {
        styleCode: input.styleCode,
      })
    }

    const snapshot: CostSheetSnapshot = {
      costSheetId: sheet.id,
      version: sheet.version,
      currency: sheet.currency,
      fobPrice: sheet.fobPrice,
      totalCost: sheet.totalCost,
      marginPct: sheet.marginPct,
      marginBasis: sections.marginBasis,
      components: componentsFromSheet(sheet, sections),
      cmLocalPerPiece: sheet.cmLocalPerPiece ?? undefined,
      localCurrency: sheet.localCurrency ?? undefined,
    }

    const breakdown = wrapRfqError(() => buildFobBreakdown(snapshot))

    if (!breakdown.reconciles) {
      // The sheet's stored total disagrees with its own components. Quoting from it would
      // put a number in front of a buyer the factory cannot rebuild.
      throw new AppError('conflict', 'rfq.errors.sheet_does_not_reconcile', {
        storedTotal: breakdown.totalCost,
        componentsTotal: breakdown.componentsTotal,
      })
    }

    const [latest] = await tx
      .select({ version: quotes.version })
      .from(quotes)
      .where(eq(quotes.rfqId, rfq.id))
      .orderBy(desc(quotes.version))
      .limit(1)

    const version = (latest?.version ?? 0) + 1

    // Version n+1 supersedes its predecessor on DRAFT, unlike a cost sheet or a packing
    // list: a quote is superseded the moment a new one is drafted, because a merchandiser
    // re-quoting has decided the old price is off the table.
    const superseded = await tx
      .update(quotes)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(and(eq(quotes.rfqId, rfq.id), sql`${quotes.status} <> 'superseded'`))
      .returning({ id: quotes.id })

    const [row] = await tx
      .insert(quotes)
      .values({
        companyId: ctx.companyId,
        rfqId: rfq.id,
        version,
        costSheetId: sheet.id,
        fobBreakdown: breakdown as unknown as Record<string, unknown>,
        fobPrice: breakdown.fobPrice,
        currency: breakdown.currency,
        cmBdtEquiv: sheet.cmLocalPerPiece ?? null,
        validityDate: input.validityDate ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: quotes.id })

    if (!row) throw new Error('quotes insert returned nothing')

    await tx
      .update(rfqs)
      .set({ status: 'quoted', updatedAt: new Date() })
      .where(eq(rfqs.id, rfq.id))

    const belowFloor =
      policy.marginFloorPct !== undefined &&
      toMinor(breakdown.achievedMarginPct) < toMinor(policy.marginFloorPct)

    await recordChange(ctx, tx, {
      action: 'insert',
      targetTable: 'quotes',
      targetId: row.id,
      after: {
        rfqId: rfq.id,
        version,
        fobPrice: breakdown.fobPrice,
        achievedMarginPct: breakdown.achievedMarginPct,
        belowFloor,
        supersededCount: superseded.length,
      },
    })

    return {
      quoteId: row.id,
      version,
      fobPrice: breakdown.fobPrice,
      achievedMarginPct: breakdown.achievedMarginPct,
      belowFloor,
      supersededCount: superseded.length,
    }
  })
}

/**
 * Rebuild the per-component costs from a stored sheet.
 *
 * The sheet keeps its inputs verbatim so the computation can be reproduced years later, so
 * this multiplies consumption by rate the same way 1.5 does. Any group the sheet does not
 * carry is omitted rather than zeroed — a component that was never quoted is different from
 * one quoted at nothing.
 */
function componentsFromSheet(
  sheet: { totalCost: string; cmLocalPerPiece: string | null; fxRateLocalToBase: string },
  sections: {
    fabric?: { consumption: string; ratePerUom: string; wastagePct?: string }[]
    trims?: { consumption: string; ratePerUom: string; wastagePct?: string }[]
    embellishment?: { costPerPiece: string }[]
  },
): Record<string, string> {
  const components: Record<string, string> = {}

  for (const group of ['fabric', 'trims'] as const) {
    const lines = sections[group]
    if (!lines || lines.length === 0) continue

    let total = 0n
    for (const line of lines) {
      const withWastage = mulMinor(
        toMinor(line.consumption),
        toMinor(String(100 + Number(line.wastagePct ?? '0'))),
      )
      total += mulMinor(withWastage, toMinor(line.ratePerUom)) / 100n
    }
    components[group] = fromMinor(total)
  }

  if (sections.embellishment && sections.embellishment.length > 0) {
    let total = 0n
    for (const line of sections.embellishment) total += toMinor(line.costPerPiece)
    components.embellishment = fromMinor(total)
  }

  const cm =
    sheet.cmLocalPerPiece && sheet.fxRateLocalToBase
      ? mulMinor(toMinor(sheet.cmLocalPerPiece), toMinor(sheet.fxRateLocalToBase))
      : 0n
  components.cm = fromMinor(cm)

  // Whatever the sheet's total carries beyond the named groups IS the commercial component.
  // Derived rather than recomputed so the components always reconcile to the stored total —
  // which is the invariant `buildFobBreakdown` then checks.
  let named = 0n
  for (const amount of Object.values(components)) named += toMinor(amount)
  components.commercial = fromMinor(toMinor(sheet.totalCost) - named)

  return components
}

/**
 * Send a quote ⚖.
 *
 * Below the company margin floor this needs a manager, enforced in code rather than in
 * approval config — the same shape as costing's below-floor rule and for the same reason: a
 * floor that lives only in `approval_rules` is a floor somebody can edit their way past.
 */
export async function sendQuote(
  ctx: RequestCtx,
  input: { quoteId: string; sentAt?: string; belowFloorReason?: string },
  policy: RfqPolicy,
): Promise<{ quoteId: string; belowFloor: boolean }> {
  return withTenantTx(ctx, async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, input.quoteId)).for('update')
    if (!quote) throw notFound('rfq.errors.quote_not_found', { quoteId: input.quoteId })

    if (quote.status !== 'draft') {
      throw conflict('rfq.errors.quote_not_draft', { quoteId: quote.id, status: quote.status })
    }

    const breakdown = quote.fobBreakdown as { achievedMarginPct?: string }
    const achieved = breakdown.achievedMarginPct ?? '0'
    const belowFloor =
      policy.marginFloorPct !== undefined && toMinor(achieved) < toMinor(policy.marginFloorPct)

    if (belowFloor && !ctx.roles.some((role) => role === 'owner' || role === 'admin')) {
      throw new AppError('forbidden', 'rfq.errors.below_floor_needs_manager', {
        achievedMarginPct: achieved,
        floorPct: policy.marginFloorPct,
      })
    }
    if (belowFloor && !input.belowFloorReason) {
      throw new AppError('validation_failed', 'rfq.errors.below_floor_needs_reason', {})
    }

    const sentAt = input.sentAt ? new Date(input.sentAt) : new Date()

    await tx
      .update(quotes)
      .set({
        status: 'sent',
        sentAt,
        belowFloorApproval: belowFloor
          ? {
              achievedMarginPct: achieved,
              floorPct: policy.marginFloorPct,
              approvedBy: ctx.userId,
              reason: input.belowFloorReason,
              approvedAt: sentAt.toISOString(),
            }
          : null,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quote.id))

    await recordChange(ctx, tx, {
      action: 'update',
      targetTable: 'quotes',
      targetId: quote.id,
      before: { status: quote.status },
      after: { status: 'sent', belowFloor, achievedMarginPct: achieved },
    })

    await emit(ctx, tx, {
      eventName: RFQ_EVENTS.quoteSent,
      payload: {
        quoteId: quote.id,
        rfqId: quote.rfqId,
        version: quote.version,
        fobPrice: quote.fobPrice,
        currency: quote.currency,
        belowFloor,
      },
      aggregateTable: 'quotes',
      aggregateId: quote.id,
    })

    return { quoteId: quote.id, belowFloor }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Winning and losing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Win an RFQ ⚖ (brief: "emits `rfq.won` with order-creation payload").
 *
 * The payload is assembled by `wonPayload`, which refuses anything 1.3 could not create an
 * order from — no size ratio means nothing 5.1 can cut, no requested ship date means no TNA.
 * Better to refuse the win than to emit an order-creation event nobody can act on.
 */
export async function markWon(
  ctx: RequestCtx,
  input: { rfqId: string },
): Promise<{ rfqId: string; payload: Record<string, unknown> }> {
  return withTenantTx(ctx, async (tx) => {
    const [rfq] = await tx.select().from(rfqs).where(eq(rfqs.id, input.rfqId)).for('update')
    if (!rfq) throw notFound('rfq.errors.not_found', { rfqId: input.rfqId })

    rfqStatusMachine.assert(rfq.status as RfqStatus, 'won')

    const [quote] = await tx
      .select()
      .from(quotes)
      .where(and(eq(quotes.rfqId, rfq.id), sql`${quotes.status} <> 'superseded'`))
      .orderBy(desc(quotes.version))
      .limit(1)

    if (!quote) {
      throw new AppError('validation_failed', 'rfq.errors.no_live_quote', { rfqId: rfq.id })
    }

    const payload = wrapRfqError(() =>
      wonPayload({
        rfqId: rfq.id,
        buyerId: rfq.buyerId,
        styleCode: rfq.styleCode ?? rfq.title,
        quantity: rfq.quantity,
        unit: rfq.unit,
        sizeRatio: rfq.sizeRatio,
        fobPrice: quote.fobPrice,
        currency: quote.currency,
        requestedShipDate: rfq.requestedShipDate,
      }),
    )

    await tx.update(rfqs).set({ status: 'won', updatedAt: new Date() }).where(eq(rfqs.id, rfq.id))

    await recordChange(ctx, tx, {
      action: 'update',
      targetTable: 'quotes',
      targetId: quote.id,
      before: { rfqStatus: rfq.status },
      after: { rfqStatus: 'won', fobPrice: quote.fobPrice, quantity: rfq.quantity },
    })

    // 1.3 creates the order off this.
    await emit(ctx, tx, {
      eventName: RFQ_EVENTS.won,
      payload: payload as unknown as Record<string, unknown>,
      aggregateTable: 'rfqs',
      aggregateId: rfq.id,
    })

    return { rfqId: rfq.id, payload: payload as unknown as Record<string, unknown> }
  })
}

/** Lose an RFQ. The reason is required — the loss taxonomy is the desk's real output. */
export async function markLost(
  ctx: RequestCtx,
  input: { rfqId: string; lossReasonCode: string; note?: string },
): Promise<void> {
  await withTenantTx(ctx, async (tx) => {
    const [rfq] = await tx.select().from(rfqs).where(eq(rfqs.id, input.rfqId)).for('update')
    if (!rfq) throw notFound('rfq.errors.not_found', { rfqId: input.rfqId })

    rfqStatusMachine.assert(rfq.status as RfqStatus, 'lost')

    const [reason] = await tx
      .select({ code: lossReasons.code })
      .from(lossReasons)
      .where(eq(lossReasons.code, input.lossReasonCode))

    if (!reason) {
      // A free-text reason cannot be counted, and counting is the point.
      throw new AppError('validation_failed', 'rfq.errors.unknown_loss_reason', {
        code: input.lossReasonCode,
      })
    }

    await tx
      .update(rfqs)
      .set({ status: 'lost', lossReasonCode: input.lossReasonCode, updatedAt: new Date() })
      .where(eq(rfqs.id, rfq.id))

    await emit(ctx, tx, {
      eventName: RFQ_EVENTS.lost,
      payload: {
        rfqId: rfq.id,
        buyerId: rfq.buyerId,
        lossReasonCode: input.lossReasonCode,
        note: input.note ?? null,
      },
      aggregateTable: 'rfqs',
      aggregateId: rfq.id,
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Jobs
// ─────────────────────────────────────────────────────────────────────────────

/** RFQs whose deadline is close and which have not been quoted (brief §Jobs). */
export async function deadlinesNear(
  ctx: AnyCtx,
  input: { today: string },
  policy: RfqPolicy,
): Promise<{ rfqId: string; title: string; deadline: string; daysLeft: number }[]> {
  const horizon = addDays(input.today, Math.ceil(policy.deadlineNearHours / 24))

  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({ id: rfqs.id, title: rfqs.title, deadline: rfqs.deadline })
      .from(rfqs)
      .where(
        and(
          lte(rfqs.deadline, horizon),
          // A quoted RFQ has met its deadline; a lost one no longer has one.
          sql`${rfqs.status} in ('open', 'clarifying')`,
        ),
      )
      .orderBy(rfqs.deadline)

    return rows
      .filter((row) => row.deadline !== null)
      .map((row) => ({
        rfqId: row.id,
        title: row.title,
        deadline: row.deadline!,
        daysLeft: dayGap(input.today, row.deadline!),
      }))
  })
}

/** Clarifications nobody has answered (brief §Jobs: 5 days). */
export async function staleClarifications(
  ctx: AnyCtx,
  input: { today: string },
  policy: RfqPolicy,
): Promise<{ clarificationId: string; rfqId: string; question: string; days: number }[]> {
  const cutoff = addDays(input.today, -policy.clarificationStaleDays)

  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(rfqClarifications)
      .where(and(isNull(rfqClarifications.answeredAt), lte(rfqClarifications.askedAt, cutoff)))
      .orderBy(rfqClarifications.askedAt)

    return rows.map((row) => ({
      clarificationId: row.id,
      rfqId: row.rfqId,
      question: row.question,
      days: dayGap(row.askedAt, input.today),
    }))
  })
}

/** Live quotes past their validity date — what the pipeline should stop counting. */
export async function expiredQuotes(
  ctx: AnyCtx,
  input: { today: string },
): Promise<(typeof quotes.$inferSelect)[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(quotes)
      .where(sql`${quotes.status} = 'sent'`)

    return rows.filter((row) =>
      wrapRfqError(() => isQuoteExpired({ validityDate: row.validityDate, today: input.today })),
    )
  })
}

function toMinor(value: string): bigint {
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
  const minor = BigInt(whole + fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -minor : minor
}

function mulMinor(a: bigint, b: bigint): bigint {
  return (a * b) / 100n
}

function fromMinor(minor: bigint): string {
  const negative = minor < 0n
  const digits = (negative ? -minor : minor).toString().padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function dayGap(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}

export { conflict }

/**
 * The loss taxonomy a fresh factory needs (brief: "seeded taxonomy: price, capacity,
 * compliance, sample, other").
 *
 * `markLost` refuses a code that is not in this table, so without it a new factory cannot
 * lose an RFQ at all. Idempotent and non-destructive: a code the factory has renamed or
 * added to is left alone.
 */
export async function seedDefaultLossReasons(
  ctx: AnyCtx,
): Promise<{ created: string[]; existing: string[] }> {
  const defaults: readonly [string, string][] = [
    ['price', 'Price too high'],
    ['capacity', 'No capacity in the requested window'],
    ['compliance', 'Failed a compliance or audit requirement'],
    ['sample', 'Sample rejected'],
    ['leadtime', 'Lead time too long'],
    ['other', 'Other'],
  ]

  return withTenantTx(ctx, async (tx) => {
    const created: string[] = []
    const existing: string[] = []

    for (const [code, label] of defaults) {
      const [already] = await tx
        .select({ code: lossReasons.code })
        .from(lossReasons)
        .where(eq(lossReasons.code, code))

      if (already) {
        existing.push(code)
        continue
      }

      await tx.insert(lossReasons).values({ companyId: ctx.companyId, code, label })
      created.push(code)
    }

    return { created, existing }
  })
}
