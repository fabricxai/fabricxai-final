/**
 * Read models for Order Memory.
 *
 * The point of this module is that the factory remembers what an order actually
 * cost it, not what it was quoted at. So every figure here is a PAIR — planned
 * against actual — and a pair with one side missing is reported as missing
 * rather than silently shown as the side that exists.
 *
 * All four jsonb columns are parsed at this boundary. An outcome compiled by an
 * older service version is the realistic case, and the failure it would
 * otherwise cause is invisible: an empty defect list reads as "this order ran
 * clean" when it actually means "I could not read the tally".
 */
import { desc, eq, inArray } from 'drizzle-orm'

import type { AnyCtx } from '@/modules/core/ctx'
import { readJsonbArray, readJsonbObject } from '@/modules/core/jsonb'
import { withTenantRead } from '@/modules/core/tenancy'
import { buyers } from '@/modules/buyers/schema'
import { orderStyles, orders } from '@/modules/orders/schema'

import { orderOutcomes } from './schema'
import {
  compiledSources as compiledSourcesSchema,
  consumptionLine,
  defectTally,
  delayEvent,
  type ConsumptionLine,
  type DefectTally,
  type DelayEvent,
} from './zod'

/** Planned against actual. `variance` is null when either side is unknown. */
export interface Pair {
  planned: string | null
  actual: string | null
  variancePct: string | null
}

export interface OutcomeCard {
  outcomeId: string
  orderId: string
  poNumber: string | null
  styleCode: string | null
  buyerName: string | null
  compiledAt: Date
  piecesProduced: number
  margin: Pair
  marginBasis: string | null
  consumption: ConsumptionLine[]
  topDefects: DefectTally[]
  delayEvents: DelayEvent[]
  /**
   * Which inputs the compiler actually had. A false is a gap in the record, and
   * null means the column itself would not parse — which is a bigger gap.
   */
  compiledSources: Record<string, boolean> | null
  /** Total jsonb entries across this row that could not be read. */
  unreadable: number
  note: string | null
  noteUpdatedAt: Date | null
}

/**
 * Variance as a percentage-point difference, computed only when BOTH sides
 * exist. These are percentages rather than money, so ordinary float arithmetic
 * is correct here — no scaled-integer discipline applies.
 */
function pairOf(planned: string | null, actual: string | null): Pair {
  if (planned === null || actual === null) return { planned, actual, variancePct: null }
  const delta = Number.parseFloat(actual) - Number.parseFloat(planned)
  return { planned, actual, variancePct: delta.toFixed(2) }
}

export async function outcomes(ctx: AnyCtx, limit = 30): Promise<OutcomeCard[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(orderOutcomes)
      .orderBy(desc(orderOutcomes.compiledAt))
      .limit(limit)

    if (rows.length === 0) return []

    const orderIds = rows.map((r) => r.orderId)

    const [orderRows, styleRows] = await Promise.all([
      tx
        .select({ id: orders.id, poNumbers: orders.poNumbers, buyerName: buyers.name })
        .from(orders)
        .leftJoin(buyers, eq(buyers.id, orders.buyerId))
        .where(inArray(orders.id, orderIds)),
      tx
        .select({ orderId: orderStyles.orderId, styleCode: orderStyles.styleCode })
        .from(orderStyles)
        .where(inArray(orderStyles.orderId, orderIds)),
    ])

    return rows.map((row): OutcomeCard => {
      const order = orderRows.find((o) => o.id === row.orderId)
      const style = styleRows.find((s) => s.orderId === row.orderId)

      const consumption = readJsonbArray(
        consumptionLine,
        row.actualConsumptionPc,
        'order_outcomes.actual_consumption_pc',
      )
      const defects = readJsonbArray(defectTally, row.topDefects, 'order_outcomes.top_defects')
      const delays = readJsonbArray(delayEvent, row.delayEvents, 'order_outcomes.delay_events')
      const sources = readJsonbObject(
        compiledSourcesSchema,
        row.compiledSources,
        'order_outcomes.compiled_sources',
      )

      return {
        outcomeId: row.id,
        orderId: row.orderId,
        poNumber: order?.poNumbers?.[0] ?? null,
        styleCode: style?.styleCode ?? null,
        buyerName: order?.buyerName ?? null,
        compiledAt: row.compiledAt,
        piecesProduced: row.piecesProduced,
        margin: pairOf(row.quotedMarginPct, row.actualMarginPct),
        marginBasis: row.marginBasis,
        consumption: consumption.items,
        topDefects: defects.items,
        delayEvents: delays.items,
        compiledSources: sources,
        unreadable:
          consumption.unreadable + defects.unreadable + delays.unreadable + (sources === null ? 1 : 0),
        note: row.merchandiserNote,
        noteUpdatedAt: row.noteUpdatedAt,
      }
    })
  })
}
