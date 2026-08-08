/**
 * MARBIM tools for 1.4 RFQ & Quotation.
 *
 * An enquiry has a deadline, and a quote sent past it is work nobody paid for. The board and
 * the three alert reads are what stop that, and none of them were reachable.
 *
 * **The QUOTE stays read-only.** A quotation is a price the factory commits to and it has
 * its own gate: below the margin floor needs a manager AND a written reason
 * (`below_floor_needs_manager`, `below_floor_needs_reason`). A drafted quote arriving in an
 * inbox would be a price nobody decided, one approval away from a buyer.
 *
 * **The ENQUIRY is drafted, and always was meant to be.** `rfqPayload`'s own docblock calls
 * itself "what MARBIM drafts from a buyer's enquiry email or PDF", `rfqs` has been a
 * registered pending target since 1.2, `commitRfq` waits behind it with the buyer check and
 * the `rfq.created` event, and the payload carries `source: 'ai_extracted'` for exactly this.
 * Everything existed except a tool to reach it — so a merchandiser could paste an enquiry
 * into MARBIM, watch it read the buyer, the board and the margin floor correctly, and then
 * be told the one thing it could not do was log the enquiry.
 *
 * The costing pack's `costing.preview` is the tool for "what would this price look like" —
 * it computes without committing, and the two together answer a pricing question honestly:
 * cost it, see the margin against the floor, and let a person quote.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { board } from './queries'
import { deadlinesNear, expiredQuotes, staleClarifications, type RfqPolicy } from './service'

async function policyFor(ctx: AnyCtx): Promise<RfqPolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<RfqPolicy>(ctx, 'rfq')
}

const noArgs = z.object({}).passthrough()
const todayInput = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
})

const rfqBoard: ReadTool = {
  kind: 'read',
  name: 'rfq.board',
  description:
    'Enquiries with their buyer, deadline, quotation status and any open clarifications. An ' +
    'RFQ waiting on a clarification is not late by the factory’s fault — say which it is.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => board(ctx, { now: new Date() }),
}

const deadlines: ReadTool = {
  kind: 'read',
  name: 'rfq.deadlines_near',
  description:
    'Enquiries whose quotation deadline is close, inside the factory’s own warning window. ' +
    'A quote sent after the deadline is work nobody paid for.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return deadlinesNear(ctx, { today }, await policyFor(ctx))
  },
}

const stale: ReadTool = {
  kind: 'read',
  name: 'rfq.stale_clarifications',
  description:
    'Questions asked of a buyer and not answered, past the waiting window. These block a ' +
    'quote and the buyer usually does not know it — the useful answer names the question.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return staleClarifications(ctx, { today }, await policyFor(ctx))
  },
}

const expired: ReadTool = {
  kind: 'read',
  name: 'rfq.expired_quotes',
  description:
    'Quotations whose validity has lapsed. A buyer accepting one of these is accepting a ' +
    'price the factory is no longer bound to — and material costs move, so say so before ' +
    'anybody honours it out of politeness.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return expiredQuotes(ctx, { today })
  },
}

/**
 * What a buyer actually sends. Every field a WIN later requires is optional here, mirroring
 * `rfqPayload` — an enquiry genuinely arrives incomplete ("ratio to follow with PO",
 * "mid-November window"), and refusing it at intake would mean nothing could be logged until
 * it was already an order. The refusal happens at `markWon`, where a missing size ratio
 * really does stop pieces being cut.
 */
const proposeEnquiryInput = z.object({
  buyerId: z.string().uuid(),
  title: z.string().min(1).max(200),
  productType: z.string().min(1).max(80),
  quantity: z.number().int().min(1),
  description: z.string().max(4000).optional(),
  styleCode: z.string().max(60).optional(),
  unit: z.string().min(1).max(10).optional(),
  sizeRatio: z.record(z.string().min(1), z.number().int().min(0)).optional(),
  targetPrice: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'expected a money amount').optional(),
  targetCurrency: z.string().length(3).optional(),
  currency: z.string().length(3).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  requestedShipDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const proposeEnquiry: DraftTool = {
  kind: 'draft',
  name: 'rfq.propose_enquiry',
  targetTable: 'rfqs',
  description:
    'Log a buyer enquiry as an RFQ draft, from the text of their email or a tech pack. ' +
    'Find the buyer first with buyers.accounts and pass its id — never invent one. ' +
    'Transcribe only what the enquiry states: leave the size ratio, ship date and target ' +
    'price out if the buyer said they follow later. It goes to a merchandiser to approve; ' +
    'nothing is quoted or committed by this.',
  input: proposeEnquiryInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const enquiry = proposeEnquiryInput.parse(args)

    return {
      targetTable: 'rfqs',
      operation: 'insert' as const,
      zodSchemaKey: 'rfq',
      // `source` is set HERE, not taken from the model. It is a fact about how the row was
      // made, and a draft that could describe itself as 'manual' would launder a machine
      // reading into a person's.
      payload: { ...enquiry, source: 'ai_extracted' as const },
      method:
        'read from a buyer enquiry · fields transcribed as stated, absent ones left absent',
    }
  },
}

export const rfqToolPack: ToolPack = {
  moduleId: 'rfq',
  tools: [rfqBoard, deadlines, stale, expired, proposeEnquiry],
}
