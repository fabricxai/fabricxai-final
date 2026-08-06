import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { schedulerSilence } from '@/modules/core/probes'
import { activeScheduledTasks } from '@/worker/processors/scheduler'

/**
 * Is the schedule still firing (plan 7.5, audit INFRA-M1/M13)?
 *
 * The route `docker-compose.prod.yml` has advertised since it was written — "the worker
 * serves no HTTP, so its liveness is observable instead through /api/health/jobs" — and which
 * did not exist. The worker's healthcheck is disabled on the strength of a URL that 404ed, so
 * a worker that had stopped firing was observable by nothing at all.
 *
 * This is the check the in-worker `core.job_health` task cannot make, because it IS the
 * worker: if everything stops, that task stops with it and nobody is told. Asked from a
 * process that keeps serving requests, a dead worker is visible.
 *
 * ## Behind a token, and it refuses rather than falling open
 *
 * It names every scheduled task this deployment runs and reports what is currently broken —
 * a map of the system and its weak points, which is reconnaissance rather than a status page.
 * With `HEALTH_TOKEN` unset the route returns 503 and says so: an operator who has not set a
 * token has not decided to publish their schedule, and a detail endpoint that defaults to
 * open is one nobody remembers to close.
 *
 * ## Coarse on purpose
 *
 * It asks only whether each task has succeeded RECENTLY SOMEWHERE, through a narrow SECURITY
 * DEFINER function returning a task name and a timestamp and no company data. Per-company
 * staleness, with the detail and the alert, belongs to the scoped job — one tenant's slow
 * night must not turn a whole deployment red.
 */
export const dynamic = 'force-dynamic'

/** Looser than the per-company job, for the reason in the header. */
const HEALTH_SILENCE_POLICY = { toleranceFactor: 3, floorMinutes: 30 } as const

/**
 * Constant-time bearer comparison.
 *
 * `===` on a secret leaks its prefix through response timing, one character at a time. The
 * length is compared first because `timingSafeEqual` throws on a mismatch — that comparison
 * leaks only the LENGTH of the token, which is not a secret and is in `.env.example`.
 */
function authorised(request: Request): boolean {
  const expected = env.HEALTH_TOKEN
  if (!expected) return false

  const header = request.headers.get('authorization') ?? ''
  const offered = header.startsWith('Bearer ') ? header.slice(7) : header

  const a = Buffer.from(offered)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    /*
     * 401 when a token is configured and wrong; 503 when none is configured at all.
     *
     * Different states with different fixes, and neither should be a 404 that reads as "the
     * route the compose file names does not exist" — which is exactly the confusion that let
     * this go missing.
     */
    return env.HEALTH_TOKEN
      ? NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      : NextResponse.json(
          { error: 'health_token_not_configured', status: 'unavailable' },
          { status: 503 },
        )
  }

  const expectations = activeScheduledTasks()

  try {
    const silence = await schedulerSilence({
      expectations,
      policy: HEALTH_SILENCE_POLICY,
    })

    if (silence.unproven) {
      // Nothing has ever run: a fresh deployment, not an outage. Reported as
      // healthy-but-unproven rather than paging somebody in its first hour.
      return NextResponse.json(
        {
          status: 'unproven',
          reason: 'no scheduled task has ever recorded a run on this deployment',
          expected: expectations.length,
        },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      )
    }

    const healthy = silence.silent.length === 0

    return NextResponse.json(
      {
        status: healthy ? 'ok' : 'degraded',
        watching: expectations.length,
        observedSince: silence.observedSince?.toISOString() ?? null,
        silent: silence.silent,
      },
      { status: healthy ? 200 : 503, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    // The caller holds the token, so the reason is theirs to have — this is the one health
    // endpoint where the exception text is not a disclosure.
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : String(error) },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
