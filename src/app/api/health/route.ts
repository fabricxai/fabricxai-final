import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db/client'
import { env } from '@/lib/env'
import { getRedis } from '@/lib/redis'
import { expectedIntervalMinutes, maxSilenceMinutes } from '@/modules/core/job-health'
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
  | { ok: false; error: string; silent?: { task: string; silentMinutes: number | null }[] }

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
 */
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

    const now = Date.now()
    const silent: { task: string; silentMinutes: number | null }[] = []

    for (const scheduled of SCHEDULED_TASKS) {
      const last = lastSuccess.get(scheduled.task)

      // A task nothing has ever run, in a system where other tasks have, is a real gap —
      // but it is also what a newly added task looks like for its first interval, so it is
      // reported with a null rather than an invented age.
      if (!last) {
        silent.push({ task: scheduled.task, silentMinutes: null })
        continue
      }

      const budget = maxSilenceMinutes(expectedIntervalMinutes(scheduled.pattern), {
        // Looser than the per-company job. This endpoint answers "is the worker running",
        // and one tenant's slow night must not turn the whole deployment red.
        toleranceFactor: 3,
        floorMinutes: 30,
      })
      const silentMinutes = Math.floor((now - last.getTime()) / 60_000)
      if (silentMinutes > budget) silent.push({ task: scheduled.task, silentMinutes })
    }

    if (silent.length > 0) {
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
