import { NextResponse } from 'next/server'

import { consume, LIMITS, tooManyRequests } from '@/lib/rate-limit'
import { isAppError } from '@/modules/core/errors'
import { requireRole } from '@/modules/core/session'
import { recordHourlyOutputs } from '@/modules/production/service'
import { hourlyOutputBatch } from '@/modules/production/zod'

/**
 * 6.1 hourly output — the burst endpoint (plan 5.7, audit BE-B6).
 *
 * A route rather than a server action, and the reason is the same one `/api/sync` gives:
 * this is posted by things that are not a React render. `k6/production_burst.js` has
 * targeted this exact path since it was written and had nothing to hit, which is why
 * TEST-B2 — the flagship load scenario — could not run at all.
 *
 * ## Why it is not simply the sync endpoint
 *
 * `production/record_hourly_outputs` IS registered as a sync handler, and the floor's own
 * tablets go through it. What that path cannot serve is a caller with no device queue: a
 * load generator, a shop-floor terminal posting straight, an integration. Both write through
 * `recordHourlyOutputsIn`, so the idempotency is identical — see below.
 *
 * ## The upsert is what makes a burst safe
 *
 * `(line, produced_on, hour_slot)` is a natural key and the insert is `ON CONFLICT DO
 * UPDATE`. Ten supervisors submitting the same hour twice write the same cell twice with
 * the same value; a correction takes the identical path. So the row count after a run is
 * bounded by lines × 24 however many requests were sent, which is exactly the assertion the
 * k6 scenario makes against the database afterwards — a 200 that wrote nothing, or wrote
 * twice, is the failure it exists to find.
 *
 * `offline_key` is accepted and passed through for a caller that HAS one. It is optional
 * here because the natural key already carries the idempotency; the key is a device's own
 * handle on its queue, not the thing that makes a replay safe.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let ctx
  try {
    // Production only. The sync handler for the same operation gates identically, so the
    // two doors into this write cannot disagree about who may use them.
    ctx = await requireRole(request.headers, 'production')
  } catch (error) {
    return refusal(error)
  }

  // Per user, not per company: one looping tablet must not lock the rest of the floor out
  // of recording its output. Checked before the body is parsed, so a flood costs one Redis
  // INCR rather than a 600-entry JSON parse.
  const limit = await consume(`rl:production:${ctx.userId}`, LIMITS.productionWrite)
  if (!limit.ok) return tooManyRequests(limit)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 })
  }

  const parsed = hourlyOutputBatch.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          // Which entry, not just "invalid". A terminal posting fifty lines needs to know
          // which one it cannot send, or it retries the whole hour forever.
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 },
    )
  }

  try {
    const result = await recordHourlyOutputs(ctx, parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    return refusal(error)
  }
}

/**
 * A typed refusal, or a rethrow.
 *
 * An `AppError` is a decision the domain made and the caller can act on. Anything else is a
 * bug, and swallowing it into a 500 body here would hide it from the error boundary and the
 * log that would otherwise carry the stack.
 */
function refusal(error: unknown): NextResponse {
  if (!isAppError(error)) throw error

  return NextResponse.json(
    { error: { code: error.code, messageKey: error.messageKey, details: error.details } },
    { status: error.status },
  )
}
