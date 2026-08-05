/**
 * Making cutting demoable.
 *
 * 5.1's PP gate fails closed, which is correct and which also means a fresh database
 * cannot cut anything. There are two ways to fix that for a demo, and they are not
 * equally good:
 *
 *  1. **`seedApprovedPpSample` — the one to use.** Creates a real PP sample request and a
 *     real approved feedback round. The gate then passes because the factory genuinely
 *     has an approval, the sample timeline screen has something in it, and the demo shows
 *     the actual mechanism rather than a hole where it should be.
 *
 *  2. **`registerDemoPpApprovalBypass` — the escape hatch.** Replaces the provider with
 *     one that always passes. It exists because sometimes you need to demo cutting
 *     before sampling data exists at all. It refuses to run under `NODE_ENV=production`
 *     and says loudly what it has done, because a bypass on a quality gate that nobody
 *     notices is worse than a gate that blocks.
 *
 * Neither is imported by application code. Both are for seeds, demos and tests.
 */
import { factoryToday } from '@/lib/dates'
import type { AnyCtx, RequestCtx } from '../core/ctx'
import { registerPpApprovalProvider } from '../cutting/gates'
import { withTenantTx } from '../core/tenancy'

import { sampleFeedbackRounds, sampleRequests } from './schema'

/**
 * Give an order style a genuine, approved PP sample.
 *
 * The preferred way to make a seeded factory able to cut. Returns the ids so a seed slice
 * can report what it created.
 */
export async function seedApprovedPpSample(
  ctx: RequestCtx,
  input: {
    orderId: string
    styleCode: string
    requestNo?: string
    recordedOn?: string
    /** Set to demo the "approved, but fix these four things" case, which also passes. */
    verdict?: 'approved' | 'approved_with_comments'
    comments?: { area: string; comment: string }[]
  },
): Promise<{ sampleRequestId: string; roundId: string }> {
  const verdict = input.verdict ?? 'approved'
  const comments = input.comments ?? []

  return withTenantTx(ctx, async (tx) => {
    const [request] = await tx
      .insert(sampleRequests)
      .values({
        companyId: ctx.companyId,
        orderId: input.orderId,
        type: 'pp',
        styleCode: input.styleCode,
        requestNo: input.requestNo ?? `PP-${input.styleCode}-${Date.now()}`,
        status: 'approved',
        createdBy: ctx.userId,
      })
      .returning({ id: sampleRequests.id })

    if (!request) throw new Error('sample_requests insert returned nothing')

    const [round] = await tx
      .insert(sampleFeedbackRounds)
      .values({
        companyId: ctx.companyId,
        sampleRequestId: request.id,
        round: 1,
        verdict,
        comments,
        recordedOn: input.recordedOn ?? factoryToday(),
        createdBy: ctx.userId,
      })
      .returning({ id: sampleFeedbackRounds.id })

    if (!round) throw new Error('sample_feedback_rounds insert returned nothing')

    return { sampleRequestId: request.id, roundId: round.id }
  })
}

/**
 * Replace the PP gate with one that always passes. **Development and demo only.**
 *
 * Refuses under `NODE_ENV=production` rather than trusting a caller not to import it
 * there. This is a quality gate whose whole purpose is to stop a factory cutting eighty
 * thousand garments against an unapproved sample; the one thing worse than not having it
 * is having it silently disabled.
 */
export function registerDemoPpApprovalBypass(options: { reason: string }): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'registerDemoPpApprovalBypass must never run in production — it disables the PP-approval gate',
    )
  }

  // Deliberately noisy. A bypass nobody notices is a bypass that ships.
  console.warn(
    `[sampling] ⚠ PP-APPROVAL GATE BYPASSED — every style is treated as approved for cutting. Reason: ${options.reason}`,
  )

  registerPpApprovalProvider(async (_ctx: AnyCtx, _tx, input) => ({
    passed: true,
    reasonKey: 'gates.pp_approval.demo_bypass',
    facts: {
      bypassed: true,
      reason: options.reason,
      orderId: input.orderId,
      orderStyleId: input.orderStyleId,
    },
  }))
}
