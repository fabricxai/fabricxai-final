/**
 * MARBIM tools for 3.2 Procurement.
 *
 * "Who can deliver by the fourteenth, and what will it cost?" is asked with a mill on the
 * other line, and getting it wrong buys fabric that arrives after the order ships.
 *
 * **The comparison ranks on LANDED cost and refuses to convert at a rate nobody gave it.**
 * `compareQuotesForItem` takes explicit rates and returns `ratesUsed` alongside the ranking,
 * so a model can say which rate produced the answer. That is why `rates` is an argument
 * rather than something looked up: this module has no ambient exchange rate, and a quote
 * comparison built on an invented one is a purchasing decision made on a number nobody
 * agreed.
 *
 * **Feasibility comes before price, and the shape enforces it.** Quotes that cannot arrive
 * by the needed-by date come back under `infeasible` with the date they WOULD arrive, not
 * ranked last — a late quote is not a cheap option, and a list that ranked it would invite
 * somebody to pick it because the price column looked good.
 *
 * **One draft, and it is the quote.** A supplier's proforma is exactly the transcription
 * this is for. Raising a purchase ORDER is not offered: a PO is the factory committing its
 * own money behind the BTB gate, and a proposed one is a commitment nobody decided to make.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { awaitingReceipt, openRequisitions, purchaseOrders, supplierBook } from './queries'
import { compareQuotesForItem, latestScores, overduePos } from './service'

const noArgs = z.object({}).passthrough()

const asOfInput = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
})

const compareInput = z.object({
  purchaseRequisitionId: z.string().uuid(),
  itemId: z.string().uuid(),
  baseCurrency: z.string().length(3).optional(),
  /**
   * Currency → rate into the base. Required for any quote not already in the base currency;
   * without one that quote cannot be ranked and says so rather than being converted.
   */
  rates: z.record(z.string().length(3), z.string().min(1)).optional(),
})

const pos: ReadTool = {
  kind: 'read',
  name: 'procurement.purchase_orders',
  description:
    'Purchase orders with their supplier, value, expected delivery and line status. An ' +
    'IMPORT PO with no back-to-back credit linked should never have been issued — if one ' +
    'appears, say so, because the factory is committed to a supplier with nothing funding it.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => purchaseOrders(ctx, { now: new Date() }),
}

const suppliers: ReadTool = {
  kind: 'read',
  name: 'procurement.suppliers',
  description:
    'The supplier book: code, name, type, origin and open orders. Origin decides whether a ' +
    'purchase needs a BTB — a local mill invoicing in USD is still a local purchase.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => supplierBook(ctx),
}

const requisitions: ReadTool = {
  kind: 'read',
  name: 'procurement.open_requisitions',
  description:
    'Requisitions still waiting on quotes or an order, with how many days until the material ' +
    'is needed. Negative days mean the date has already passed.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => openRequisitions(ctx, { now: new Date() }),
}

const compare: ReadTool = {
  kind: 'read',
  name: 'procurement.compare_quotes',
  description:
    'Rank the quotes on a requisition line by LANDED cost — the quantity actually charged ' +
    '(MOQ included), plus duty and freight, in one currency. Quotes that cannot arrive by ' +
    'the needed-by date come back separately as infeasible with the date they would arrive: ' +
    'those are not cheap options, they are not options. Supply `rates` for any currency ' +
    'other than the base; never convert at a rate you were not given, and quote `ratesUsed` ' +
    'when you give an answer.',
  input: compareInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = compareInput.parse(args)
    return compareQuotesForItem(ctx, input)
  },
}

const late: ReadTool = {
  kind: 'read',
  name: 'procurement.overdue_pos',
  description:
    'Purchase orders past their expected delivery with lines still outstanding — what to ' +
    'chase before the cutting date arrives.',
  input: asOfInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { asOf } = asOfInput.parse(args)
    return overduePos(ctx, { asOf })
  },
}

const awaiting: ReadTool = {
  kind: 'read',
  name: 'procurement.awaiting_goods',
  description:
    'PO lines still owed, with what has arrived and what is outstanding, soonest-late first. ' +
    'A line with no promised date can never be late and never scores its supplier on time — ' +
    'worth saying when one appears.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => awaitingReceipt(ctx, { now: new Date() }),
}

const scores: ReadTool = {
  kind: 'read',
  name: 'procurement.supplier_scores',
  description:
    'Supplier scorecards by period: on-time, reject rate, price index and quote ' +
    'responsiveness, with the number of observations behind each. A blank metric is NOT a ' +
    'zero — it means there was nothing to measure, and 100% on-time from one receipt is not ' +
    'a track record. Always quote the observation count.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => latestScores(ctx),
}

/**
 * The quote draft.
 *
 * Lead time scores lowest, below even the price. A transposed unit price is usually caught
 * because somebody knows roughly what fabric costs; a lead time read as 21 days when the
 * proforma said 45 turns a feasible quote into one that lands after the order ships, and
 * nothing downstream re-checks it until the fabric is not there.
 */
const proposeQuoteInput = z.object({
  purchaseRequisitionId: z.string().uuid(),
  supplierId: z.string().uuid(),
  currency: z.string().length(3),
  quotedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  documentId: z.string().uuid().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        unitPrice: z.string().min(1),
        leadTimeDays: z.number().int().min(0),
        moq: z.string().optional(),
        freight: z.string().optional(),
        dutyPct: z.string().optional(),
      }),
    )
    .min(1),
})

const proposeQuote: DraftTool = {
  kind: 'draft',
  name: 'procurement.propose_supplier_quote',
  targetTable: 'supplier_quotes',
  description:
    'Propose a supplier’s quotation read off their proforma — prices, lead times, MOQs and ' +
    'any freight or duty. It goes to the approve inbox because the comparison that picks a ' +
    'mill is built from these numbers: a transposed lead time picks a supplier who cannot ' +
    'make the date.',
  input: proposeQuoteInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const quote = proposeQuoteInput.parse(args)

    return {
      targetTable: 'supplier_quotes',
      operation: 'insert' as const,
      zodSchemaKey: 'supplier_quote',
      payload: quote,
      // Read the lead times. A wrong price surfaces at the next costing; a wrong lead
      // time surfaces on the day the fabric does not arrive, and nothing between here and
      // there re-checks it.
      method:
        'read from a supplier proforma · nothing downstream re-checks a lead time until it is late',
      ...(quote.documentId ? { sourceDocumentId: quote.documentId } : {}),
    }
  },
}

export const procurementToolPack: ToolPack = {
  moduleId: 'procurement',
  tools: [pos, suppliers, requisitions, compare, late, awaiting, scores, proposeQuote],
}
