/**
 * MARBIM tools for 1.4 RFQ & Quotation.
 *
 * An enquiry has a deadline, and a quote sent past it is work nobody paid for. The board and
 * the three alert reads are what stop that, and none of them were reachable.
 *
 * **Read-only, including the quote.** A quotation is a price the factory commits to and it
 * has its own gate: below the margin floor needs a manager AND a written reason
 * (`below_floor_needs_manager`, `below_floor_needs_reason`). A drafted quote arriving in an
 * inbox would be a price nobody decided, one approval away from a buyer.
 *
 * The costing pack's `costing.preview` is the tool for "what would this price look like" —
 * it computes without committing, and the two together answer a pricing question honestly:
 * cost it, see the margin against the floor, and let a person quote.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

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

export const rfqToolPack: ToolPack = {
  moduleId: 'rfq',
  tools: [rfqBoard, deadlines, stale, expired],
}
