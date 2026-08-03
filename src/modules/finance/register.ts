/**
 * Module registration for 11.1 ⚖
 *
 * `order_costs_actual` and `order_profitability` are deliberately NOT pending targets, and
 * there is no zod payload for either. Both are accrued from the modules that own the source
 * data, and nothing — no user, no model — may hand this module a cost figure. The entire
 * value of a variance report is that neither side of it was chosen by the person the report
 * is about.
 *
 * `invoices` and `payables` are drafted, because both arrive as documents somebody types in.
 */
import { registerModule } from '../core/registry'

import { financeToolPack } from './tools'

import { FINANCE_ZOD_MAP } from './zod'

export const financeModule = registerModule({
  id: 'finance',

  pendingTargets: ['invoices', 'payables'],
  zodMap: FINANCE_ZOD_MAP,

  /**
   * Read-only. `invoices` and `payables` are pending targets so a HUMAN can raise one with
   * a second person signing; money leaving the factory is what rule 3 was built around, and
   * a conversational route to proposing a payment is exactly what it exists to prevent.
   */
  toolPack: financeToolPack,

  approvalDefaults: { requiredRoles: ['owner', 'admin', 'finance'] },

  // Both targets were registered from the start with nothing to commit them. A payment is
  // the one that matters most: money leaving the factory, approved by somebody other than
  // the person who negotiated the delivery.
  commitHandlers: {
    payables: async (ctx, tx, input) => {
      // Lazy — a static import from './service' puts this file in the service's evaluation
      // graph, which is how commercial ended up registering itself twice.
      const { commitPayable } = await import('./service')
      const result = await commitPayable(ctx, tx, {
        operation: input.operation,
        payload: input.payload,
      })
      return { rowId: result.rowId, after: result.after }
    },
    invoices: async (ctx, tx, input) => {
      const { commitInvoice } = await import('./service')
      const { getPolicy } = await import('../settings/service')
      const policy = await getPolicy<import('./service').FinancePolicy>(ctx, 'finance')
      const result = await commitInvoice(ctx, tx, { payload: input.payload }, policy)
      return { rowId: result.rowId, after: result.after }
    },
  },

  domainPrimer: {
    version: '11.1.0',
    text: `You are helping the commercial finance desk of a Bangladeshi garment export factory.

WHAT THIS MODULE IS NOT
It is not a general ledger. There are no journals, no accounts, no double entry, and no
trial balance. The factory runs Tally for that. Never offer to post a journal or reconcile
an account — say that belongs in their accounting system and answer the question they
actually asked.

THE TWO QUESTIONS THIS ANSWERS
1. WHEN DOES CASH MOVE? An eight-week timeline of receivables in and payables out. Two
   things matter: a receivable that has already realized is money in the bank and must never
   appear as future cash, and the week the running balance first goes negative is the single
   most useful number on the screen — lead with it.
2. DID THE ORDER MAKE MONEY? Quoted cost against accrued actual, component by component.

FORECASTING WHEN THE BANK PAYS
Never use payment terms. Terms say 30 days and the bank takes 45. Use the buyer's own median
realization lag; if they have no history say so and use the company default. Never assume
zero — that forecasts cash arriving the day the invoice was raised.

THE MEDIAN, NOT THE MEAN. One LC that took ninety days over a dispute would drag a mean
weeks out for every future shipment.

MARGIN BASIS
Margin on PRICE and margin on COST are different numbers: 0.34 on a 5.00 price is 6.80%, the
same 0.34 on a 4.66 cost is 7.30%. Always say which basis a figure uses, and never compare an
actual computed one way against a quote computed the other — the variance would be made
entirely of arithmetic.

THE WATERFALL MUST ADD UP
The component variances always sum to the total variance. If you are presenting one and the
steps do not reach the total, something is missing — say so rather than presenting it.

REALIZATION IS USUALLY SHORT
The bank deducts its charges before crediting, so realized is normally a little under
invoiced. That is not an error. A deduction of more than a few percent is something else —
a dispute or a discount — and it needs a written reason.

DRAFTING
You may draft an invoice and a payable from documents. You may NOT produce a cost figure, an
accrual, or a margin. Those are computed from the store, planning and bank records, and a
cost somebody can type is a cost somebody will type.`,
  },
})
