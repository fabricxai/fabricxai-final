import { NextResponse } from 'next/server'
import { z } from 'zod'

import { factoryToday } from '@/lib/dates'
import { consume, LIMITS, tooManyRequests } from '@/lib/rate-limit'
import { isAppError } from '@/modules/core/errors'
import { requireRole } from '@/modules/core/session'
import { getBoard } from '@/modules/production/service'

/**
 * 6.1 the hourly board (plan 5.7, audit BE-B6).
 *
 * The read half of the burst. Twenty tablets and a manager's TV poll this through a shift
 * while fifty lines post into the same table, and `k6/production_burst.js` runs both at once
 * because that contention IS the scenario — a board that is fast on an idle table says
 * nothing about 17:00.
 *
 * ## One partition, by construction
 *
 * `hourly_outputs` is partitioned by month and `getBoard` filters on an equality over
 * `produced_on`, so the planner removes every other partition rather than scanning it. That
 * is the whole reason for the partitioning, and it is why the date is REQUIRED-ish here:
 * defaulting to the factory's today keeps a caller that omits it on the same fast path
 * instead of quietly asking for everything.
 *
 * ## Read-only, and a wider audience than the write
 *
 * Planning and quality both read the floor's progress without touching it — `nav.ts` says
 * exactly that for `/lines`. The write above is production's alone.
 */
export const dynamic = 'force-dynamic'

const query = z.object({
  producedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .optional(),
})

export async function GET(request: Request) {
  let ctx
  try {
    ctx = await requireRole(request.headers, 'production', 'planner', 'quality')
  } catch (error) {
    if (!isAppError(error)) throw error
    return NextResponse.json(
      { error: { code: error.code, messageKey: error.messageKey, details: error.details } },
      { status: error.status },
    )
  }

  const limit = await consume(`rl:production-board:${ctx.userId}`, LIMITS.productionBoard)
  if (!limit.ok) return tooManyRequests(limit)

  const url = new URL(request.url)
  const parsed = query.safeParse({
    producedOn: url.searchParams.get('producedOn') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 },
    )
  }

  // The FACTORY's today, not the server's. A board asked for at 00:30 in Dhaka is asking
  // about the shift that is running, and UTC would answer with yesterday's for six hours
  // every night — which is precisely the window a night shift is posting into.
  const producedOn = parsed.data.producedOn ?? factoryToday()
  const cells = await getBoard(ctx, { producedOn })

  return NextResponse.json({ producedOn, cells })
}
