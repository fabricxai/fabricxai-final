/**
 * Read models for Commercial Finance.
 *
 * Two rules govern everything here:
 *
 *  - **Only OPEN items forecast cash.** A realized receivable is money already
 *    in the bank; counting it as arriving again is how a forecast promises the
 *    same cash twice.
 *  - **Currencies are never netted.** Receivables land in USD and wages are paid
 *    in BDT, and there is no ambient exchange rate anywhere in this system. A
 *    finance screen is the worst possible place to invent the first one, so
 *    every total is reported per currency.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { AnyCtx } from '@/modules/core/ctx'
import { readJsonbArray, readJsonbObject } from '@/modules/core/jsonb'
import { withTenantRead } from '@/modules/core/tenancy'

import { suppliers, supplierPos } from '@/modules/procurement/schema'

import { invoices, payables, receivables } from './schema'

/**
 * `receivables.expected_basis` — how the expected date was arrived at, so a
 * wrong forecast can be explained rather than merely corrected. Free-form
 * because the lag model's inputs differ by buyer and by instrument.
 */
const expectedBasis = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

/**
 * `order_profitability_rows.variance` — the frozen waterfall. Each row is one
 * cost component and what it did to the margin, which is the only form in which
 * "we lost two points" is actionable.
 */
const varianceLine = z.object({
  component: z.string().min(1),
  quoted: z.union([z.string(), z.number()]).transform(String),
  actual: z.union([z.string(), z.number()]).transform(String),
  variance: z.union([z.string(), z.number()]).transform(String),
})

export type VarianceLine = z.infer<typeof varianceLine>

export interface ReceivableRow {
  id: string
  amount: string
  currency: string
  expectedAt: string | null
  /** How the expected date was arrived at. Null when the stored basis would not parse. */
  expectedBasis: Record<string, string | number | boolean> | null
  realizedAmount: string | null
  shortfall: string | null
  status: string
  invoiceNumber: string | null
  /** Negative once the expected date has passed with nothing realized. */
  daysToExpected: number | null
}

function daysUntil(dateIso: string, now: Date): number {
  const target = new Date(`${dateIso}T00:00:00Z`).getTime()
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((target - today) / 86_400_000)
}

export async function receivableBook(
  ctx: AnyCtx,
  input: { now: Date },
): Promise<ReceivableRow[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: receivables.id,
        amount: receivables.amount,
        currency: receivables.currency,
        expectedAt: receivables.expectedAt,
        expectedBasis: receivables.expectedBasis,
        realizedAmount: receivables.realizedAmount,
        shortfall: receivables.shortfall,
        status: receivables.status,
        invoiceId: receivables.invoiceId,
      })
      .from(receivables)
      .orderBy(asc(receivables.expectedAt))
      .limit(200)

    if (rows.length === 0) return []

    const invoiceIds = rows.map((r) => r.invoiceId).filter((id): id is string => !!id)
    const invoiceRows =
      invoiceIds.length > 0
        ? await tx
            .select({ id: invoices.id, number: invoices.number })
            .from(invoices)
            .where(inArray(invoices.id, invoiceIds))
        : []

    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      expectedAt: r.expectedAt,
      expectedBasis: readJsonbObject(expectedBasis, r.expectedBasis, 'receivables.expected_basis'),
      realizedAmount: r.realizedAmount,
      shortfall: r.shortfall,
      status: r.status,
      invoiceNumber: invoiceRows.find((i) => i.id === r.invoiceId)?.number ?? null,
      // Only open items can be late — a realized one arrived, whenever that was.
      daysToExpected:
        r.expectedAt && (r.status === 'open' || r.status === 'part_realized')
          ? daysUntil(r.expectedAt, input.now)
          : null,
    }))
  })
}

export interface PayableRow {
  id: string
  reference: string | null
  amount: string
  currency: string
  dueAt: string | null
  paidAmount: string | null
  status: string
  supplierName: string | null
  poNumber: string | null
  daysToDue: number | null
}

export async function payableBook(ctx: AnyCtx, input: { now: Date }): Promise<PayableRow[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: payables.id,
        reference: payables.reference,
        amount: payables.amount,
        currency: payables.currency,
        dueAt: payables.dueAt,
        paidAmount: payables.paidAmount,
        status: payables.status,
        supplierPoId: payables.supplierPoId,
      })
      .from(payables)
      .orderBy(asc(payables.dueAt))
      .limit(200)

    if (rows.length === 0) return []

    const poIds = rows.map((r) => r.supplierPoId).filter((id): id is string => !!id)
    const poRows =
      poIds.length > 0
        ? await tx
            .select({
              id: supplierPos.id,
              poNumber: supplierPos.poNumber,
              supplierName: suppliers.name,
            })
            .from(supplierPos)
            .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
            .where(inArray(supplierPos.id, poIds))
        : []

    return rows.map((r) => {
      const po = poRows.find((p) => p.id === r.supplierPoId)
      return {
        id: r.id,
        reference: r.reference,
        amount: r.amount,
        currency: r.currency,
        dueAt: r.dueAt,
        paidAmount: r.paidAmount,
        status: r.status,
        supplierName: po?.supplierName ?? null,
        poNumber: po?.poNumber ?? null,
        daysToDue:
          r.dueAt && (r.status === 'open' || r.status === 'part_paid')
            ? daysUntil(r.dueAt, input.now)
            : null,
      }
    })
  })
}

export interface CurrencyPosition {
  currency: string
  /** Still owed to the factory. Open and part-realized only. */
  incoming: string
  /** Still owed by the factory. */
  outgoing: string
  incomingCount: number
  outgoingCount: number
}

/**
 * Position per currency, never netted across.
 *
 * Returned as separate incoming and outgoing figures rather than one net
 * number, because the net of a USD receivable and a BDT payable is a figure in
 * neither currency.
 */
export async function positionByCurrency(ctx: AnyCtx): Promise<CurrencyPosition[]> {
  return withTenantRead(ctx, async (tx) => {
    const [inRows, outRows] = await Promise.all([
      tx
        .select({
          currency: receivables.currency,
          total: sql<string>`coalesce(sum(${receivables.amount}), 0)::text`,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(receivables)
        .where(
          and(
            isNull(receivables.realizedAt),
            inArray(receivables.status, ['open', 'part_realized']),
          ),
        )
        .groupBy(receivables.currency),
      tx
        .select({
          currency: payables.currency,
          total: sql<string>`coalesce(sum(${payables.amount}), 0)::text`,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(payables)
        .where(inArray(payables.status, ['open', 'part_paid']))
        .groupBy(payables.currency),
    ])

    const currencies = [...new Set([...inRows.map((r) => r.currency), ...outRows.map((r) => r.currency)])]

    return currencies.sort().map((currency) => {
      const i = inRows.find((r) => r.currency === currency)
      const o = outRows.find((r) => r.currency === currency)
      return {
        currency,
        incoming: i?.total ?? '0',
        outgoing: o?.total ?? '0',
        incomingCount: i?.count ?? 0,
        outgoingCount: o?.count ?? 0,
      }
    })
  })
}

/** Orders whose actual margin has been computed, worst variance first. */
export async function profitability(
  ctx: AnyCtx,
  limit = 20,
): Promise<
  {
    orderId: string
    fobPrice: string
    currency: string
    quotedMarginPct: string | null
    actualMarginPct: string | null
    marginBasis: string | null
    variance: VarianceLine[]
    /** Waterfall rows that would not parse — the breakdown below is incomplete. */
    varianceUnreadable: number
  }[]
> {
  const { orderProfitabilityRows } = await import('./schema')
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        orderId: orderProfitabilityRows.orderId,
        fobPrice: orderProfitabilityRows.fobPrice,
        currency: orderProfitabilityRows.currency,
        quotedMarginPct: orderProfitabilityRows.quotedMarginPct,
        actualMarginPct: orderProfitabilityRows.actualMarginPct,
        marginBasis: orderProfitabilityRows.marginBasis,
        variance: orderProfitabilityRows.variance,
        computedAt: orderProfitabilityRows.computedAt,
      })
      .from(orderProfitabilityRows)
      // Worst actual margin first — ordering on the jsonb waterfall would sort
      // by its serialised text, which is not an ordering of anything.
      .orderBy(asc(orderProfitabilityRows.actualMarginPct))
      .limit(limit)

    return rows.map((r) => {
      const waterfall = readJsonbArray(
        varianceLine,
        r.variance,
        'order_profitability_rows.variance',
      )
      return {
        orderId: r.orderId,
        fobPrice: r.fobPrice,
        currency: r.currency,
        quotedMarginPct: r.quotedMarginPct,
        actualMarginPct: r.actualMarginPct,
        marginBasis: r.marginBasis,
        variance: waterfall.items,
        varianceUnreadable: waterfall.unreadable,
      }
    })
  })
}
