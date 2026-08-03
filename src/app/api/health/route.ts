import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db/client'
import { env } from '@/lib/env'
import { getRedis } from '@/lib/redis'
import { staleTasks } from '@/modules/core/job-health'
import { SCHEDULED_TASKS } from '@/worker/processors/scheduler'

/**
 * Liveness + dependency check. Uptime Kuma polls this (dev-plan §8).
 * Deliberately exercises the real pooled path (PgBouncer) rather than a direct
 * connection — a green health check that bypasses the pooler proves nothing.
 */
export const dynamic = 'force-dynamic'

type Check = { ok: true; latencyMs: number } | { ok: false; error: string }

type SchedulerCheck =
  | { ok: true; tasks: number }
  | { ok: false; error: string; silent?: { task: string; silentMinutes: number; neverRun: boolean }[] }

/**
 * Looser than the per-company job. This endpoint answers "is the worker running", and one
 * tenant's slow night must not turn the whole deployment red.
 */
const HEALTH_SILENCE_POLICY = { toleranceFactor: 3, floorMinutes: 30 } as const

/**
 * Is the scheduler alive at all?
 *
 * This is the check the in-worker `core.job_health` task cannot make, because it IS the
 * worker: if everything stops, that task stops with it and nobody is told. Here, in a
 * process that keeps serving requests, a dead worker is visible — and uptime monitoring
 * already polls this endpoint.
 *
 * Deliberately coarse. It asks only whether each scheduled task has succeeded RECENTLY
 * somewhere, through a narrow SECURITY DEFINER function that returns a task name and a
 * timestamp and no company data. Per-company staleness, with the detail and the alert,
 * belongs to the scoped job.
 *
 * A fresh install has no runs at all, which is not a fault — so an empty table is reported
 * as healthy-but-unproven rather than as an outage that would have every new deployment
 * paging somebody on its first hour.
 *
 * The same honesty is owed to a task that has not run YET. A worker that started ten
 * minutes ago has fired its five-minute tasks and none of its nightly ones, and measuring
 * a never-run task as infinitely stale reported exactly that healthy deployment as an
 * outage — for a day on every daily task and for a month on every monthly one. So a task
 * with no run is measured from when this deployment first recorded ANY run, the
 * deployment-level equivalent of the company-creation baseline `staleTasks` uses. Nothing
 * can have been provably quiet for longer than we have been listening.
 *
 * What that deliberately gives up: a task wired into the schedule but never dispatched is
 * no longer caught HERE once its budget exceeds the run history. That case belongs to the
 * per-company `core.job_health` job, which measures from company creation and does catch
 * it — and which is where the detail and the alert live anyway.
 *
 * The staleness rule itself is `staleTasks`, shared with the per-company job rather than
 * restated here — two copies of "how long may this be quiet" would drift the first time
 * somebody tuned one of them.
 */
/**
 * When this deployment first recorded a job run — the baseline a never-run task is aged
 * from. Null only when nothing has ever run, which the caller has already handled.
 */
async function schedulerObservedSince(): Promise<Date | null> {
  const result = await db.execute<{ observed_since: string | null }>(
    sql`select app.scheduler_observed_since() as observed_since`,
  )
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  const value = (rows as { observed_since: string | null }[])[0]?.observed_since
  return value ? new Date(value) : null
}

async function schedulerCheck(): Promise<SchedulerCheck> {
  try {
    const result = await db.execute<{ task: string; last_success_at: string }>(
      sql`select task, last_success_at from app.scheduler_last_success()`,
    )
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    const lastSuccess = new Map(
      (rows as { task: string; last_success_at: string }[]).map((row) => [
        row.task,
        new Date(row.last_success_at),
      ]),
    )

    // Nothing has ever run. A fresh deployment, not an outage.
    if (lastSuccess.size === 0) return { ok: true, tasks: 0 }

    const now = new Date()
    // Non-null here: rows exist, or the size check above would have returned. `now` would
    // make every never-run task look brand new, which is the safe direction for a fallback
    // that cannot happen.
    const observedSince = (await schedulerObservedSince()) ?? now

    const stale = staleTasks({
      expectations: SCHEDULED_TASKS,
      lastSuccessAt: Object.fromEntries(lastSuccess),
      now,
      watchingSince: observedSince,
      policy: HEALTH_SILENCE_POLICY,
    })

    if (stale.length > 0) {
      const silent = stale.map((entry) => ({
        task: entry.task,
        silentMinutes: entry.silentMinutes,
        neverRun: entry.neverRun,
      }))
      return { ok: false, error: `${silent.length} scheduled task(s) have gone quiet`, silent }
    }

    return { ok: true, tasks: SCHEDULED_TASKS.length }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const startedAt = Date.now()
  try {
    await fn()
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function GET() {
  const [postgres, redis, scheduler] = await Promise.all([
    timed(() => db.execute(sql`select 1`)),
    timed(async () => getRedis().ping()),
    schedulerCheck(),
  ])

  // A silent scheduler is DEGRADED, not down: the app is serving requests and the database
  // is up. It still returns 503 so an uptime monitor notices — a schedule that stopped
  // firing being visible is the entire point of the check.
  const healthy = postgres.ok && redis.ok && scheduler.ok

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      env: env.NODE_ENV,
      checks: { postgres, redis, scheduler },
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  )
}
