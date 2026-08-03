/**
 * MARBIM tools for 9.2 Finance.
 *
 * Two questions get asked here with somebody waiting: "can we pay this?" and "did we
 * actually make anything on that order?" Both have real answers in this module, and neither
 * was reachable — an assistant that knew USD is buyer-facing and BDT is local could read
 * neither a receivable nor a margin.
 *
 * **Nothing is totalled across currencies, anywhere.** Every figure here is reported inside
 * its own currency, because there is no rate in this module and inventing one would produce
 * a single confident number that is wrong by whatever the market did that week. The position
 * tool returns one row per currency for exactly that reason, and a model that adds them has
 * fabricated the most quotable figure on the screen.
 *
 * **The cash timeline is a projection and carries its assumption.** It leans on each buyer's
 * realization lag — how long they have actually taken to pay — and falls back to a stated
 * default for a buyer with no history. A date derived from a default is a guess wearing a
 * calendar, so the assumption travels with the answer.
 *
 * **No draft tool, deliberately.** `invoices` and `payables` are pending targets so a human
 * can raise one through the approve inbox with a second person signing. Money leaving the
 * factory is the one thing this whole trust layer was built around; a conversational route
 * to proposing a payment is precisely what rule 3 exists to prevent.
 */
import { z } from 'zod'

import type { AnyCtx, RequestCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { payableBook, positionByCurrency, profitability, receivableBook } from './queries'
import { cashTimelineFor, orderPnl, overdueReceivables, type FinancePolicy } from './service'

/** The company's own lag default and erosion threshold — both are stated, not derived. */
async function policyFor(ctx: AnyCtx): Promise<FinancePolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<FinancePolicy>(ctx, 'finance')
}

const noArgs = z.object({}).passthrough()

const asOfInput = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
})

const timelineInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weeks: z.number().int().min(1).max(52).default(12),
  /** Required: a cash timeline spanning currencies would be a made-up number. */
  currency: z.string().min(3).max(3),
  openingBalance: z.string().optional(),
})

const pnlInput = z.object({
  orderId: z.string().uuid(),
  styleCode: z.string().min(1),
})

const limitInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
})

const receivables: ReadTool = {
  kind: 'read',
  name: 'finance.receivables',
  description:
    'What buyers owe, with the invoice, its currency, due date and days outstanding. Never ' +
    'sum across currencies — report each currency separately, because there is no exchange ' +
    'rate here and a combined total would be invented.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => receivableBook(ctx, { now: new Date() }),
}

const payables: ReadTool = {
  kind: 'read',
  name: 'finance.payables',
  description:
    'What the factory owes suppliers, with amounts, currencies, due dates and what has been ' +
    'settled. Use it to answer "can we pay this" alongside the cash timeline — a payable due ' +
    'next week against cash arriving the week after is the question, not the balance alone.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => payableBook(ctx, { now: new Date() }),
}

const position: ReadTool = {
  kind: 'read',
  name: 'finance.position_by_currency',
  description:
    'Receivable and payable position, one row per currency. This shape is the point: USD is ' +
    'buyer-facing and BDT is local, and the factory is long one and short the other. Quote ' +
    'the rows; never add them together.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => positionByCurrency(ctx),
}

const overdue: ReadTool = {
  kind: 'read',
  name: 'finance.overdue_receivables',
  description:
    'Invoices past their due date as at a given day, with how far past. These are the ones ' +
    'somebody has to chase; say the buyer, the amount in its own currency, and the days.',
  input: asOfInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { asOf } = asOfInput.parse(args)
    return overdueReceivables(ctx, { asOf })
  },
}

const timeline: ReadTool = {
  kind: 'read',
  name: 'finance.cash_timeline',
  description:
    'Projected cash in and out by week for ONE currency, from each buyer’s own realization ' +
    'lag. A projection, not a bank statement: a buyer with no payment history falls back to ' +
    'the company’s stated default lag, so say which weeks rest on real history and which on ' +
    'the default before anybody commits to a payment date.',
  input: timelineInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = timelineInput.parse(args)
    const policy = await policyFor(ctx)

    const result = await cashTimelineFor(ctx, input)

    // The assumption travels with the answer. A projected date is only as good as the lag
    // behind it, and the lag is a company policy somebody set.
    return { ...result, defaultRealizationLagDays: policy.defaultRealizationLagDays }
  },
}

const margins: ReadTool = {
  kind: 'read',
  name: 'finance.profitability',
  description:
    'Quoted margin against actual margin per order — where the money went, not where it was ' +
    'expected to. A gap between the two is erosion, and it is the number worth raising ' +
    'before the next quote on the same style.',
  input: limitInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { limit } = limitInput.parse(args)
    return profitability(ctx, limit)
  },
}

const pnl: ReadTool = {
  kind: 'read',
  name: 'finance.order_pnl',
  description:
    'One order’s profit and loss: revenue, the costs accrued against it and the margin that ' +
    'actually landed. If a figure is unavailable it says why — quote the reason rather than ' +
    'treating a missing cost as zero, which would report a better margin than the order made.',
  input: pnlInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = pnlInput.parse(args)
    return orderPnl(ctx as RequestCtx, input, await policyFor(ctx))
  },
}

export const financeToolPack: ToolPack = {
  moduleId: 'finance',
  tools: [receivables, payables, position, overdue, timeline, margins, pnl],
}
