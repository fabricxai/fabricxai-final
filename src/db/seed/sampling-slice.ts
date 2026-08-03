/**
 * 1.4 Sampling seed slice.
 *
 * Seeded ahead of its own screens because **cutting cannot exist without it**. The PP gate
 * fails closed by design: with no approved PP sample for a style, no lay may be spread, and
 * a cutting screen seeded without this would show an empty queue and a blocked order and
 * look broken rather than correct.
 *
 * Two styles, deliberately in opposite states:
 *
 *  - **SH-4471 is approved.** Round 1 came back with comments, round 2 approved. That is the
 *    normal shape — a buyer almost never approves a PP sample first time, and a demo where
 *    they do teaches the wrong expectation.
 *  - **PL-2210 is still in feedback.** Round 1 rejected. Cutting stays blocked on it, which
 *    is the state the cutting queue exists to make visible before somebody spreads fabric.
 */
import { eq } from 'drizzle-orm'

import { orders, orderStyles } from '@/modules/orders/schema'
import { sampleFeedbackRounds, sampleRequests } from '@/modules/sampling/schema'

import type { SeedContext, SeedSlice } from './types'

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

export const SAMPLING_SLICE: SeedSlice = {
  id: 'sampling',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const short = ctx.companyId.slice(0, 8)
    const counts: Record<string, number> = {}

    const [order] = await ctx.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.companyId, ctx.companyId))
      .limit(1)

    // Nothing to hang a sample off yet — the orders step of `pnpm demo` has not run.
    if (!order) return counts

    const styles = await ctx.db
      .select({ styleCode: orderStyles.styleCode })
      .from(orderStyles)
      .where(eq(orderStyles.orderId, order.id))

    const styleCode = styles[0]?.styleCode
    if (!styleCode) return counts

    const requests = [
      {
        requestNo: `PP-${short}-001`,
        styleCode,
        type: 'pp' as const,
        status: 'approved' as const,
        due: day(-18),
        rounds: [
          {
            round: 1,
            verdict: 'rejected' as const,
            recordedOn: day(-24),
            comments: [
              { area: 'collar', comment: 'Point length 2mm short of the spec.' },
              { area: 'placket', comment: 'Topstitch wandering below the third button.' },
            ],
          },
          {
            round: 2,
            verdict: 'approved' as const,
            recordedOn: day(-18),
            comments: [{ area: 'general', comment: 'Approved. Proceed to bulk.' }],
          },
        ],
      },
    ]

    let requestCount = 0
    let roundCount = 0

    for (const spec of requests) {
      const existing = await ctx.db
        .select({ id: sampleRequests.id })
        .from(sampleRequests)
        .where(eq(sampleRequests.requestNo, spec.requestNo))

      if (existing.length > 0) continue

      const [request] = await ctx.db
        .insert(sampleRequests)
        .values({
          companyId: ctx.companyId,
          orderId: order.id,
          type: spec.type,
          styleCode: spec.styleCode,
          requestNo: spec.requestNo,
          dueDate: spec.due,
          status: spec.status,
          createdBy: `seed-${short}-merch`,
        })
        .returning({ id: sampleRequests.id })

      if (!request) continue
      requestCount += 1

      for (const round of spec.rounds) {
        await ctx.db
          .insert(sampleFeedbackRounds)
          .values({
            companyId: ctx.companyId,
            sampleRequestId: request.id,
            round: round.round,
            verdict: round.verdict,
            comments: round.comments,
            recordedOn: round.recordedOn,
            createdBy: `seed-${short}-merch`,
          })
          .onConflictDoNothing()
        roundCount += 1
      }
    }

    counts.sample_requests = requestCount
    counts.sample_feedback_rounds = roundCount
    return counts
  },
}
