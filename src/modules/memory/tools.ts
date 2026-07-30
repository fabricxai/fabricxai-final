/**
 * MARBIM tools for 1.6 — the first tool pack in the system.
 *
 * Both are READ tools. This module has no draft tool at all, and that is a decision rather
 * than an omission: its one drafting operation, `seedCostSheet`, copies a past order's
 * measured consumption into a bill of materials that becomes a price. A model choosing which
 * historical order to price a new enquiry from is a commercial judgement about which past
 * work is comparable — it belongs to the merchandiser who will have to defend the quote.
 *
 * What a model SHOULD do here is answer the question that precedes that judgement: what have
 * we made like this, and how did it go. That is exactly what these two return.
 */
import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { findSimilar, outcomeFor } from './service'
import { findSimilarInput, outcomeLookupInput } from './zod'

const findSimilarOrders: ReadTool = {
  kind: 'read',
  name: 'memory.find_similar_orders',
  description:
    'Find past styles similar to a style code or a set of attributes (product type, GSM, ' +
    'construction, gauge), with what actually happened when the factory made them: pieces ' +
    'shipped, quoted vs achieved margin, top defects and which milestones slipped. Use this ' +
    'before discussing whether a new enquiry is like anything the factory has done.',
  input: findSimilarInput,
  execute: async (ctx: AnyCtx, args: unknown) => findSimilar(ctx, args),
}

const orderOutcome: ReadTool = {
  kind: 'read',
  name: 'memory.order_outcome',
  description:
    'The compiled record of one closed order: measured consumption per piece, the daily ' +
    'efficiency curve, top defects, milestone slips and margins. Check `sources` before ' +
    'drawing a conclusion — an absent source means that system was not in use, not that the ' +
    'order ran clean.',
  input: outcomeLookupInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { orderId } = outcomeLookupInput.parse(args)
    return outcomeFor(ctx, orderId)
  },
}

export const memoryToolPack: ToolPack = {
  moduleId: 'memory',
  tools: [findSimilarOrders, orderOutcome],
}
