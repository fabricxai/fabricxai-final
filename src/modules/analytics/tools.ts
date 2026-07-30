/**
 * MARBIM tools for 11.2 — read-only, as the brief requires.
 *
 * There is no draft tool here and there could not sensibly be one: everything this module
 * holds is derived from another module's rows, so a proposal against it would be asking
 * somebody to approve a calculation.
 *
 * Both tools return the honest shapes rather than flattened numbers — the `unavailable`
 * reasons, the coverage map, the denominators — because a model summarising a dashboard is
 * exactly where "no data" quietly becomes "zero".
 */
import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { exceptions, otd, orderBook, type AnalyticsPolicy } from './queries'
import { exceptionsToolInput, otdToolInput } from './zod'

/** Passed until X.3 Settings owns it. Matches the brief's 5-minute TTL. */
const DEFAULT_POLICY: AnalyticsPolicy = {
  ttlSeconds: 300,
  minShipmentsForOtd: 5,
  scorecard: { minOrders: 5, weights: { otd: 0.5, dhu: 0.3, margin: 0.2 } },
  trend: { minPoints: 4, thresholdPct: '2' },
}

const currentExceptions: ReadTool = {
  kind: 'read',
  name: 'analytics.exceptions',
  description:
    'What is currently wrong across the factory: LC conflicts, TNA milestones at risk, ' +
    'open critical audit findings, and drafts waiting for approval — each with how long it ' +
    'has been open. Read `coverage` before concluding anything: a kind that is not scanned ' +
    'returns nothing, which is not the same as nothing being wrong.',
  input: exceptionsToolInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { now } = exceptionsToolInput.parse(args)
    return exceptions(ctx, now ? new Date(now) : new Date(), DEFAULT_POLICY)
  },
}

const deliveryRecord: ReadTool = {
  kind: 'read',
  name: 'analytics.on_time_delivery',
  description:
    'On-time delivery over a window, as shipment counts plus a percentage. The percentage ' +
    'is withheld below a minimum number of shipments — when it is, quote the counts.',
  input: otdToolInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const window = otdToolInput.parse(args)
    return otd(ctx, window, DEFAULT_POLICY)
  },
}

const book: ReadTool = {
  kind: 'read',
  name: 'analytics.order_book',
  description: 'Orders and contracted pieces by status — the shape of the current book.',
  input: exceptionsToolInput,
  execute: async (ctx: AnyCtx) => orderBook(ctx),
}

export const analyticsToolPack: ToolPack = {
  moduleId: 'analytics',
  tools: [currentExceptions, deliveryRecord, book],
}
