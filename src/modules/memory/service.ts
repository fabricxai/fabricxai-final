/**
 * 1.6 Order Memory — service layer.
 *
 * What this module sells is trust in a number nobody can re-derive by hand. A merchandiser
 * quoting a new enquiry looks at "we made something like this and it consumed 1.47 m a
 * piece" and prices against it. So the whole service is arranged around one distinction:
 *
 *   a MEASUREMENT — issued quantity over pieces actually shipped, from rows anyone can go
 *   and look at — versus a GUESS dressed up to look like one.
 *
 * Three consequences run through everything below.
 *
 * **The outcome is compiled once and frozen.** It is assembled from live tables — efficiency
 * gets recomputed, defects get recoded, a cost gets a late correction — and a "memory" that
 * quietly changed under the person reading it would be worse than no memory. Immutable after
 * compilation except the merchandiser's own note, for seven days.
 *
 * **An absent source is recorded, not defaulted.** `compiledSources` says which of the four
 * inputs actually had rows. An order closed before 6.1 was in use has no efficiency curve,
 * and an empty array must never read as "this order ran with no defects".
 *
 * **Vectors from two models are never compared.** `findSimilar` filters fingerprints to the
 * model that embedded the query. Mixing them returns confident nonsense with a percentage
 * beside it, which is precisely the failure this module would be blamed for.
 */
import { createHash } from 'node:crypto'

import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import type { AnyCtx, RequestCtx } from '../core/ctx'
import { AppError, conflict, notFound } from '../core/errors'
import { emit } from '../core/outbox'
import { propose } from '../core/pending-changes'
import { scoped } from '../core/scoped'
import { withTenantRead, withTenantTx, type TenantDb } from '../core/tenancy'
import { getProvider } from '../marbim/provider'

import { MEMORY_EVENTS } from './events'
import {
  assertOutcomePatch,
  delayEvents,
  efficiencyCurve,
  EMBEDDING_DIM,
  fingerprintText,
  matchPercent,
  MemoryError,
  noteWindowOpen,
  NOTE_EDIT_WINDOW_DAYS,
  perPieceConsumption,
  seededLineConfidence,
  topDefects,
  type DayEfficiency,
  type DefectTally,
  type DelayEvent,
} from './memory'
import { orderOutcomes, styleFingerprints } from './schema'
import {
  compileOutcomeInput,
  embedStyleInput,
  findSimilarInput,
  outcomeNoteInput,
  seedCostSheetInput,
} from './zod'

function wrapMemoryError<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof MemoryError) {
      throw new AppError('validation_failed', 'memory.errors.invalid', { reason: error.message })
    }
    throw error
  }
}

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex')

// ─────────────────────────────────────────────────────────────────────────────
// Fingerprints
// ─────────────────────────────────────────────────────────────────────────────

export interface EmbedStyleResult {
  fingerprintId: string
  /** False when the text was unchanged and no model call was made. */
  embedded: boolean
  model: string
}

/**
 * Embed a style so it can be found by similarity. Queued on style create/update.
 *
 * Skips the model call when the fingerprint TEXT is unchanged. The check is on the text and
 * not on an `updated_at`, because the text is the only thing that determines the vector — an
 * order touched for an unrelated reason should not cost an embedding, and a style whose GSM
 * was corrected must be re-embedded even if nothing else moved.
 */
export async function embedStyle(ctx: AnyCtx, input: unknown): Promise<EmbedStyleResult> {
  const payload = embedStyleInput.parse(input)

  const text = wrapMemoryError(() =>
    fingerprintText({
      styleCode: payload.styleCode,
      attrs: payload.attrs,
      techPackText: payload.techPackText,
    }),
  )
  const sourceHash = hashOf(text)

  const existing = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(styleFingerprints)
      .where(scoped(styleFingerprints, ctx, eq(styleFingerprints.styleCode, payload.styleCode)))
    return row
  })

  if (existing && existing.sourceHash === sourceHash) {
    return { fingerprintId: existing.id, embedded: false, model: existing.model }
  }

  const result = await getProvider().embed({
    role: 'embed',
    inputs: [text],
    dimensions: EMBEDDING_DIM,
  })

  const vector = result.vectors[0]
  if (!vector || vector.length !== EMBEDDING_DIM) {
    // A model returning a different width fails per-row on insert, inside a job nobody is
    // watching. Caught here, it is one clear error naming both numbers.
    throw new AppError('validation_failed', 'memory.errors.embedding_width', {
      expected: EMBEDDING_DIM,
      received: vector?.length ?? 0,
      model: result.model,
    })
  }

  return withTenantTx(ctx, async (tx) => {
    const values = {
      companyId: ctx.companyId,
      styleCode: payload.styleCode,
      attrs: payload.attrs as Record<string, unknown>,
      embedding: vector,
      model: result.model,
      sourceHash,
      embeddedAt: new Date(),
      updatedAt: new Date(),
    }

    const [row] = await tx
      .insert(styleFingerprints)
      .values({ ...values, createdBy: ctx.userId })
      .onConflictDoUpdate({
        target: [styleFingerprints.companyId, styleFingerprints.styleCode],
        set: values,
      })
      .returning({ id: styleFingerprints.id })

    if (!row) throw new Error('style_fingerprints upsert returned nothing')

    await emit(ctx, tx, {
      eventName: MEMORY_EVENTS.styleEmbedded,
      payload: { styleCode: payload.styleCode, fingerprintId: row.id, model: result.model },
      aggregateTable: 'style_fingerprints',
      aggregateId: row.id,
    })

    return { fingerprintId: row.id, embedded: true, model: result.model }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarity
// ─────────────────────────────────────────────────────────────────────────────

export interface SimilarStyle {
  styleCode: string
  /** 0.0–100.0, one decimal. */
  matchPct: string
  model: string
  /** The most recent compiled outcome for an order carrying this style, if there is one. */
  outcome: {
    orderId: string
    compiledAt: Date
    piecesProduced: number
    quotedMarginPct: string | null
    actualMarginPct: string | null
    marginBasis: string | null
    topDefects: unknown[]
    delayEvents: unknown[]
    sources: Record<string, boolean>
  } | null
}

/**
 * The k most similar styles, each with what happened when the factory made it.
 *
 * A match with no outcome is still returned. "We quoted something very like this and never
 * booked it" is a real answer, and dropping those rows would make the panel look like the
 * factory has only ever made things that went well.
 */
export async function findSimilar(ctx: AnyCtx, input: unknown): Promise<SimilarStyle[]> {
  const payload = findSimilarInput.parse(input)

  const query = await resolveQueryVector(ctx, payload)

  const rows = await withTenantRead(ctx, async (tx) =>
    tx
      .select({
        styleCode: styleFingerprints.styleCode,
        model: styleFingerprints.model,
        distance: sql<number>`${styleFingerprints.embedding} <=> ${JSON.stringify(query.vector)}::vector`,
      })
      .from(styleFingerprints)
      .where(scoped(styleFingerprints, ctx, 
        and(
          // Only vectors from the SAME model. Two models place the same style in different
          // spaces, and a distance computed across them is a number with no meaning.
          eq(styleFingerprints.model, query.model),
          payload.styleCode
            ? sql`${styleFingerprints.styleCode} <> ${payload.styleCode}`
            : sql`true`,
        ),
      ))
      .orderBy(sql`${styleFingerprints.embedding} <=> ${JSON.stringify(query.vector)}::vector`)
      .limit(payload.k),
  )

  if (rows.length === 0) return []

  const outcomes = await outcomesByStyle(
    ctx,
    rows.map((row) => row.styleCode),
  )

  return rows.map((row) => ({
    styleCode: row.styleCode,
    matchPct: wrapMemoryError(() => matchPercent(Number(row.distance))),
    model: row.model,
    outcome: outcomes.get(row.styleCode) ?? null,
  }))
}

/** The query vector: an existing fingerprint where there is one, else a fresh embedding. */
async function resolveQueryVector(
  ctx: AnyCtx,
  payload: { styleCode?: string; attrs?: Record<string, unknown>; techPackText?: string },
): Promise<{ vector: number[]; model: string }> {
  if (payload.styleCode && !payload.attrs) {
    const existing = await withTenantRead(ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(styleFingerprints)
        .where(scoped(styleFingerprints, ctx, eq(styleFingerprints.styleCode, payload.styleCode!)))
      return row
    })

    if (!existing) {
      // Refused rather than embedded on the spot. A style with no fingerprint has not been
      // through `embedStyle`, and quietly embedding it here would hide a broken job queue
      // behind results that look fine.
      throw notFound('memory.errors.no_fingerprint', { styleCode: payload.styleCode })
    }
    return { vector: existing.embedding, model: existing.model }
  }

  const text = wrapMemoryError(() =>
    fingerprintText({
      styleCode: payload.styleCode ?? '',
      attrs: (payload.attrs ?? {}) as Record<string, string | number | null>,
      techPackText: payload.techPackText,
    }),
  )

  const result = await getProvider().embed({
    role: 'embed',
    inputs: [text],
    dimensions: EMBEDDING_DIM,
  })

  const vector = result.vectors[0]
  if (!vector || vector.length !== EMBEDDING_DIM) {
    throw new AppError('validation_failed', 'memory.errors.embedding_width', {
      expected: EMBEDDING_DIM,
      received: vector?.length ?? 0,
      model: result.model,
    })
  }
  return { vector, model: result.model }
}

/** The latest compiled outcome per style code, via the orders that carried it. */
async function outcomesByStyle(
  ctx: AnyCtx,
  styleCodes: readonly string[],
): Promise<Map<string, SimilarStyle['outcome']>> {
  if (styleCodes.length === 0) return new Map()

  const { orderStyles } = await import('@/modules/orders/schema')

  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        styleCode: orderStyles.styleCode,
        orderId: orderOutcomes.orderId,
        compiledAt: orderOutcomes.compiledAt,
        piecesProduced: orderOutcomes.piecesProduced,
        quotedMarginPct: orderOutcomes.quotedMarginPct,
        actualMarginPct: orderOutcomes.actualMarginPct,
        marginBasis: orderOutcomes.marginBasis,
        topDefects: orderOutcomes.topDefects,
        delayEvents: orderOutcomes.delayEvents,
        sources: orderOutcomes.compiledSources,
      })
      .from(orderOutcomes)
      .innerJoin(orderStyles, eq(orderStyles.orderId, orderOutcomes.orderId))
      .where(scoped(orderOutcomes, ctx, inArray(orderStyles.styleCode, [...styleCodes])))
      .orderBy(orderOutcomes.compiledAt)

    const latest = new Map<string, SimilarStyle['outcome']>()
    // Ascending, so the last write per style wins — the most recently compiled outcome.
    for (const row of rows) {
      latest.set(row.styleCode, {
        orderId: row.orderId,
        compiledAt: row.compiledAt,
        piecesProduced: row.piecesProduced,
        quotedMarginPct: row.quotedMarginPct,
        actualMarginPct: row.actualMarginPct,
        marginBasis: row.marginBasis,
        topDefects: row.topDefects,
        delayEvents: row.delayEvents,
        sources: row.sources,
      })
    }
    return latest
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The outcome compiler
// ─────────────────────────────────────────────────────────────────────────────

export interface CompiledOutcome {
  outcomeId: string
  orderId: string
  piecesProduced: number
  sources: Record<string, boolean>
}

/**
 * Assemble a closed order's record from the modules that watched it happen.
 *
 * Runs on `orders.order.status_changed → closed`. Every source is optional and each records
 * whether it had anything, because this system is being adopted module by module and an
 * order that closed before 6.1 was switched on genuinely has no efficiency curve. Reporting
 * that as a clean run would be the most expensive kind of wrong: it is the number the next
 * quote gets built on.
 */
export async function compileOutcome(ctx: AnyCtx, input: unknown): Promise<CompiledOutcome> {
  const { orderId } = compileOutcomeInput.parse(input)

  const { orders } = await import('@/modules/orders/schema')

  return withTenantTx(ctx, async (tx) => {
    // Read the order under tenant scope first. Postgres runs FK checks with RLS bypassed, so
    // the foreign key alone would accept another factory's order id quite happily.
    const [order] = await tx.select().from(orders).where(scoped(orders, ctx, eq(orders.id, orderId)))
    if (!order) throw notFound('memory.errors.order_not_found', { orderId })

    const pieces = await piecesShipped(ctx, tx, orderId)

    const consumption = await consumptionActuals(ctx, tx, orderId, pieces)
    const curve = await orderEfficiencyCurve(ctx, tx, orderId)
    const defects = await orderTopDefects(ctx, tx, orderId)
    const delays = await orderDelayEvents(ctx, tx, orderId)
    const margins = await orderMargins(ctx, tx, orderId)

    const sources = {
      consumption: consumption.length > 0,
      efficiency: curve.length > 0,
      defects: defects.length > 0,
      delays: delays.length > 0,
      margins: margins !== null,
    }

    const values = {
      companyId: ctx.companyId,
      orderId,
      compiledAt: new Date(),
      actualConsumptionPc: consumption,
      efficiencyCurve: curve,
      topDefects: defects,
      delayEvents: delays,
      compiledSources: sources,
      quotedMarginPct: margins?.quotedMarginPct ?? null,
      actualMarginPct: margins?.actualMarginPct ?? null,
      marginBasis: margins?.marginBasis ?? null,
      piecesProduced: pieces,
      updatedAt: new Date(),
    }

    const [row] = await tx
      .insert(orderOutcomes)
      .values({ ...values, createdBy: ctx.userId })
      // A redelivered `orders.closed` recompiles rather than adding a second, competing
      // account of the same order. The note is deliberately left alone by the update set.
      .onConflictDoUpdate({ target: orderOutcomes.orderId, set: values })
      .returning({ id: orderOutcomes.id })

    if (!row) throw new Error('order_outcomes upsert returned nothing')

    await emit(ctx, tx, {
      eventName: MEMORY_EVENTS.outcomeCompiled,
      payload: { orderId, outcomeId: row.id, sources, piecesProduced: pieces },
      aggregateTable: 'order_outcomes',
      aggregateId: row.id,
    })

    // The one thing no table holds: why. Asked once, while the merchandiser still remembers.
    await emit(ctx, tx, {
      eventName: MEMORY_EVENTS.closeOutPrompt,
      payload: {
        orderId,
        outcomeId: row.id,
        ownerUserId: order.ownerUserId,
        noteWindowDays: NOTE_EDIT_WINDOW_DAYS,
      },
      aggregateTable: 'order_outcomes',
      aggregateId: row.id,
    })

    return { outcomeId: row.id, orderId, piecesProduced: pieces, sources }
  })
}

/**
 * Pieces that actually left the factory: cartons loaded onto a shipment.
 *
 * Not cut, not sewn, not the contracted quantity. Consumption per piece is only meaningful
 * against the pieces the consumption produced, and a cancelled order that consumed fabric
 * for 12,000 and shipped 400 must show the 400 — otherwise it becomes the cheapest style
 * the factory has ever made.
 */
/*
 * These six gatherers all took a `ctx` rather than an exemption (plan 1.3).
 *
 * They are what an order's OUTCOME is compiled from — pieces shipped, actual consumption,
 * the efficiency curve, top defects, delays, margin — and that outcome is then embedded and
 * offered to a merchandiser as "what this factory achieved on the three most similar
 * styles". A figure gathered from another factory's order would be quoted to a buyer as this
 * one's own history.
 */
async function piecesShipped(ctx: AnyCtx, tx: TenantDb, orderId: string): Promise<number> {
  const { cartons } = await import('@/modules/shipment/schema')

  const [row] = await tx
    .select({ pieces: sql<string>`coalesce(sum(${cartons.totalQty}), 0)` })
    .from(cartons)
    .where(scoped(cartons, ctx, and(eq(cartons.orderId, orderId), sql`${cartons.shipmentId} is not null`)))

  return Number(row?.pieces ?? 0)
}

interface ConsumptionRow {
  itemRef: string
  uom: string
  issued: string
  perPiece: string
  piecesProduced: number
}

/** Total issued per item ÷ pieces shipped. The figure the next cost sheet is seeded from. */
async function consumptionActuals(
  ctx: AnyCtx,
  tx: TenantDb,
  orderId: string,
  pieces: number,
): Promise<ConsumptionRow[]> {
  // Without a denominator there is no per-piece figure. Returning the raw issued quantity
  // labelled "per piece" is the exact confusion this module has to not create.
  if (pieces <= 0) return []

  const { issueLines, issues, items } = await import('@/modules/store/schema')

  const rows = await tx
    .select({
      itemRef: items.code,
      uom: issueLines.unit,
      issued: sql<string>`sum(${issueLines.qty})`,
    })
    .from(issueLines)
    .innerJoin(issues, eq(issues.id, issueLines.issueId))
    .innerJoin(items, eq(items.id, issueLines.itemId))
    .where(scoped(issueLines, ctx, eq(issues.orderId, orderId)))
    .groupBy(items.code, issueLines.unit)

  return rows.map((row) => ({
    itemRef: row.itemRef,
    uom: row.uom,
    issued: row.issued,
    perPiece: wrapMemoryError(() => perPieceConsumption(row.issued, pieces)),
    piecesProduced: pieces,
  }))
}

/**
 * The efficiency the order actually ran at, day by day.
 *
 * Built from the lines this order was allocated to, over the dates it was allocated for, and
 * flagged wherever the same line also carried another order that day. The flag is the honest
 * part — see `efficiencyCurve` for why the number is not divided.
 */
async function orderEfficiencyCurve(ctx: AnyCtx, tx: TenantDb, orderId: string): Promise<DayEfficiency[]> {
  const { allocations } = await import('@/modules/planning/schema')
  const { efficiencyDaily } = await import('@/modules/production/schema')

  const mine = await tx
    .select({
      lineId: allocations.lineId,
      startDate: allocations.startDate,
      endDate: allocations.endDate,
    })
    .from(allocations)
    .where(scoped(allocations, ctx, eq(allocations.orderId, orderId)))

  if (mine.length === 0) return []

  const rows: { lineId: string; forDate: string; efficiencyPct: string }[] = []
  const ordersOnLineDate: Record<string, number> = {}

  for (const window of mine) {
    const daily = await tx
      .select({
        lineId: efficiencyDaily.lineId,
        forDate: efficiencyDaily.forDate,
        efficiencyPct: efficiencyDaily.efficiencyPct,
      })
      .from(efficiencyDaily)
      .where(scoped(efficiencyDaily, ctx, 
        and(
          eq(efficiencyDaily.lineId, window.lineId),
          gte(efficiencyDaily.forDate, window.startDate),
          lte(efficiencyDaily.forDate, window.endDate),
        ),
      ))

    for (const day of daily) {
      // A line can appear in two allocations for the same order (a split run). The pure
      // function refuses duplicates, so collapse them here where the reason is known.
      if (rows.some((r) => r.lineId === day.lineId && r.forDate === day.forDate)) continue
      rows.push(day)

      const [others] = await tx
        .select({ n: sql<string>`count(distinct ${allocations.orderId})` })
        .from(allocations)
        .where(scoped(allocations, ctx, 
          and(
            eq(allocations.lineId, day.lineId),
            lte(allocations.startDate, day.forDate),
            gte(allocations.endDate, day.forDate),
          ),
        ))
      ordersOnLineDate[`${day.lineId}|${day.forDate}`] = Number(others?.n ?? 1)
    }
  }

  return wrapMemoryError(() => efficiencyCurve({ rows, ordersOnLineDate }))
}

/** What went wrong, from the inline checks recorded against this order. */
async function orderTopDefects(ctx: AnyCtx, tx: TenantDb, orderId: string): Promise<DefectTally[]> {
  const { inlineChecks } = await import('@/modules/quality/schema')

  const rows = await tx
    .select({ defects: inlineChecks.defects })
    .from(inlineChecks)
    .where(scoped(inlineChecks, ctx, eq(inlineChecks.orderId, orderId)))

  return wrapMemoryError(() => topDefects(rows.map((row) => ({ defects: row.defects }))))
}

/** Which milestones moved. An un-actualized milestone is a gap, not an on-time delivery. */
async function orderDelayEvents(ctx: AnyCtx, tx: TenantDb, orderId: string): Promise<DelayEvent[]> {
  const { tnaMilestones } = await import('@/modules/orders/schema')

  const rows = await tx
    .select({
      name: tnaMilestones.name,
      plannedDate: tnaMilestones.plannedDate,
      actualDate: tnaMilestones.actualDate,
    })
    .from(tnaMilestones)
    .where(scoped(tnaMilestones, ctx, eq(tnaMilestones.orderId, orderId)))

  return wrapMemoryError(() => delayEvents(rows))
}

/**
 * Quoted versus achieved margin, taken whole from 11.1.
 *
 * Both figures and their basis come from the same row or none of them do. Margin on price
 * and margin on cost differ by several points, and pairing a quoted figure on one basis with
 * an actual on the other would produce a variance the factory would act on.
 */
async function orderMargins(
  ctx: AnyCtx,
  tx: TenantDb,
  orderId: string,
): Promise<{ quotedMarginPct: string; actualMarginPct: string; marginBasis: string } | null> {
  const { orderProfitabilityRows } = await import('@/modules/finance/schema')

  const [row] = await tx
    .select({
      quotedMarginPct: orderProfitabilityRows.quotedMarginPct,
      actualMarginPct: orderProfitabilityRows.actualMarginPct,
      marginBasis: orderProfitabilityRows.marginBasis,
    })
    .from(orderProfitabilityRows)
    .where(scoped(orderProfitabilityRows, ctx, eq(orderProfitabilityRows.orderId, orderId)))

  return row ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// The note
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The merchandiser's own account of the order, within seven days of compilation.
 *
 * The only mutable field on a compiled outcome, and the only place a reason ever gets
 * recorded — no table holds "the buyer changed the trim twice in January". The window is
 * short on purpose: written while it is remembered, and closed before it becomes a place to
 * revise history around an awkward margin.
 */
export async function setOutcomeNote(
  ctx: RequestCtx,
  input: unknown,
  now = new Date(),
): Promise<{ outcomeId: string }> {
  const payload = outcomeNoteInput.parse(input)

  // Belt and braces with the type: this is the guard that says which fields may move at all.
  wrapMemoryError(() => assertOutcomePatch({ merchandiserNote: payload.merchandiserNote }))

  return withTenantTx(ctx, async (tx) => {
    const [outcome] = await tx
      .select()
      .from(orderOutcomes)
      .where(scoped(orderOutcomes, ctx, eq(orderOutcomes.orderId, payload.orderId)))
      .for('update')

    if (!outcome) throw notFound('memory.errors.outcome_not_found', { orderId: payload.orderId })

    if (!noteWindowOpen(outcome.compiledAt, now)) {
      throw conflict('memory.errors.note_window_closed', {
        orderId: payload.orderId,
        compiledAt: outcome.compiledAt.toISOString(),
        windowDays: NOTE_EDIT_WINDOW_DAYS,
      })
    }

    await tx
      .update(orderOutcomes)
      .set({
        merchandiserNote: payload.merchandiserNote || null,
        noteUpdatedAt: now,
        noteUpdatedBy: ctx.userId,
        updatedAt: now,
      })
      .where(scoped(orderOutcomes, ctx, eq(orderOutcomes.id, outcome.id)))

    return { outcomeId: outcome.id }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeding
// ─────────────────────────────────────────────────────────────────────────────

export interface SeedResult {
  pendingChangeId: string
  /** How many lines carry a figure measured on the source order. */
  measuredLines: number
  /** How many kept the old estimate because nothing was issued against them. */
  plannedLines: number
}

/**
 * Seed a bill of materials for a new enquiry from what a past order actually consumed.
 *
 * Drafted, never written: it goes through `pending_changes` into 1.5's `boms`, because these
 * are the numbers the next quote is priced from and 1.5 owns what a BOM may contain.
 *
 * Every line says whether its consumption was MEASURED on that order or carried over from
 * its estimate, and the per-field confidence reflects how much evidence stands behind each —
 * a figure averaged over 12,000 pieces and one over 400 are not the same claim.
 */
export async function seedCostSheet(ctx: RequestCtx, input: unknown): Promise<SeedResult> {
  const payload = seedCostSheetInput.parse(input)

  const { bomLines, boms } = await import('@/modules/costing/schema')
  const { orderStyles } = await import('@/modules/orders/schema')
  const { rfqs } = await import('@/modules/rfq/schema')

  const gathered = await withTenantRead(ctx, async (tx) => {
    // Both parents read under tenant scope before anything references them.
    const [rfq] = await tx.select().from(rfqs).where(scoped(rfqs, ctx, eq(rfqs.id, payload.targetRfqId)))
    if (!rfq) throw notFound('memory.errors.rfq_not_found', { rfqId: payload.targetRfqId })

    const [outcome] = await tx
      .select()
      .from(orderOutcomes)
      .where(scoped(orderOutcomes, ctx, eq(orderOutcomes.orderId, payload.fromOrderId)))
    if (!outcome) {
      // Seeding from an order whose outcome was never compiled would copy the ESTIMATES off
      // its BOM and present them as history. The whole value of seeding is the measurement.
      throw notFound('memory.errors.no_outcome', { orderId: payload.fromOrderId })
    }

    const [sourceStyle] = await tx
      .select({ styleCode: orderStyles.styleCode })
      .from(orderStyles)
      .where(scoped(orderStyles, ctx, eq(orderStyles.orderId, payload.fromOrderId)))
    if (!sourceStyle) {
      throw notFound('memory.errors.source_style_not_found', { orderId: payload.fromOrderId })
    }

    const [sourceBom] = await tx
      .select()
      .from(boms)
      .where(scoped(boms, ctx, eq(boms.styleCode, sourceStyle.styleCode)))
      .orderBy(boms.createdAt)
    if (!sourceBom) {
      throw notFound('memory.errors.no_source_bom', { styleCode: sourceStyle.styleCode })
    }

    const lines = await tx.select().from(bomLines).where(scoped(bomLines, ctx, eq(bomLines.bomId, sourceBom.id)))
    if (lines.length === 0) {
      throw new AppError('validation_failed', 'memory.errors.empty_source_bom', {
        bomId: sourceBom.id,
      })
    }

    return { rfq, outcome, styleCode: sourceStyle.styleCode, lines }
  })

  const measured = new Map<string, { perPiece: string; uom: string }>()
  for (const entry of gathered.outcome.actualConsumptionPc as ConsumptionRow[]) {
    measured.set(entry.itemRef, { perPiece: entry.perPiece, uom: entry.uom })
  }

  const pieces = gathered.outcome.piecesProduced
  const seededLines = gathered.lines.map((line) => {
    // Matched on the store item code. A line with no item code was never issued against and
    // therefore was never measured, whatever else is true of it.
    const actual = line.itemRef ? measured.get(line.itemRef) : undefined

    return {
      lineGroup: line.lineGroup,
      itemRef: line.itemRef ?? undefined,
      spec: line.spec ?? undefined,
      consumption: actual?.perPiece ?? line.consumption,
      uom: actual?.uom ?? line.uom,
      wastagePct: line.wastagePct,
      consumptionBasis: actual ? ('actual' as const) : ('planned' as const),
    }
  })

  const fieldConfidence: Record<string, number> = {}
  seededLines.forEach((line, index) => {
    fieldConfidence[`lines.${index}.consumption`] = wrapMemoryError(() =>
      seededLineConfidence({ basis: line.consumptionBasis, piecesProduced: pieces }),
    )
  })

  const proposed = await propose(ctx, {
    moduleId: 'costing',
    targetTable: 'boms',
    operation: 'insert',
    zodSchemaKey: 'bom_seeded_from_order_v1',
    payload: {
      // The RFQ's own style code where it has one — this BOM is for the new enquiry, not a
      // second copy of the old style.
      styleCode: gathered.rfq.styleCode ?? gathered.styleCode,
      fromOrderId: payload.fromOrderId,
      lines: seededLines,
    },
    fieldConfidence,
    source: 'user_draft',
  })

  return {
    pendingChangeId: proposed.id,
    measuredLines: seededLines.filter((line) => line.consumptionBasis === 'actual').length,
    plannedLines: seededLines.filter((line) => line.consumptionBasis === 'planned').length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function outcomeFor(
  ctx: AnyCtx,
  orderId: string,
): Promise<typeof orderOutcomes.$inferSelect | null> {
  return withTenantRead(ctx, async (tx) => {
    const [row] = await tx.select().from(orderOutcomes).where(scoped(orderOutcomes, ctx, eq(orderOutcomes.orderId, orderId)))
    return row ?? null
  })
}

export async function recentOutcomes(
  ctx: AnyCtx,
  limit = 20,
): Promise<(typeof orderOutcomes.$inferSelect)[]> {
  return withTenantRead(ctx, async (tx) =>
    tx
      .select()
      .from(orderOutcomes)
      .orderBy(sql`${orderOutcomes.compiledAt} desc`)
      .limit(limit),
  )
}
