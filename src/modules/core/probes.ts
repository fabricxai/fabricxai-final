/**
 * What the health endpoints ask, on the right side of the layering (plan 7.5).
 *
 * `/api/health/**` was the one route exempted from the db-import ban, and the audit noted that
 * the exemption compounded the problem it sat next to: the route that queried the database
 * directly was also the route that printed raw exception strings to the internet.
 *
 * Splitting it into three would have meant widening the exemption to three routes. So instead
 * the queries moved here, where every other module's do, and the exemption is gone. The
 * routes are now what rule 1 says a route is — auth, then a call.
 *
 * ## No `ctx`, and that is not an oversight
 *
 * Every other function in this module takes a tenant context. These deliberately do not: they
 * answer questions ABOUT THE DEPLOYMENT, not about a company — "can this process reach
 * Postgres", "has the scheduler fired anywhere recently". There is no tenant to scope to, and
 * inventing one would make the answer wrong (a per-company reading of a fleet-wide question).
 *
 * What keeps that safe is that they read nothing tenant-owned. `pingDatabase` runs `select 1`.
 * `schedulerSilence` goes through a narrow SECURITY DEFINER function that returns a task name
 * and a timestamp — no company id, no payload, nothing a leak could be made of.
 */
import { sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { getRedis } from '@/lib/redis'

import { staleTasks, type TaskExpectation } from './job-health'

export interface Probe {
  ok: boolean
  latencyMs: number
}

/**
 * How long a dependency may take before it counts as not ready.
 *
 * A readiness probe that can hang has failed at its own job: a load balancer holding an open
 * connection to an instance that will never answer is exactly the instance it is trying to
 * take out of rotation. Found by writing the test — the first `/api/ready` call sat for the
 * full 60-second limit because ioredis retries a dead server with backoff rather than
 * refusing, so the probe inherited a retry loop it never asked for.
 *
 * Two seconds is far longer than a healthy pooled `select 1` (single-digit ms here) and far
 * shorter than any proxy's own timeout, so the answer arrives as a 503 the load balancer can
 * act on rather than as a hang it has to give up on.
 */
const PROBE_TIMEOUT_MS = 2_000

/**
 * Reject if `run` has not settled in time.
 *
 * The underlying query is NOT cancelled — a `select 1` already in flight will finish into a
 * pool nobody is listening to, which costs one round trip and is the correct trade. Cancelling
 * a Postgres statement mid-flight means a second connection and a second failure mode, in the
 * one code path whose entire job is to answer quickly.
 */
function withDeadline<T>(run: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    run(),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('probe timed out')), ms)
      // So a pending timer cannot hold the process open. This runs in a request handler, but
      // the worker imports the module too.
      timer.unref?.()
    }),
  ])
}

async function timed(run: () => Promise<unknown>): Promise<Probe> {
  const startedAt = Date.now()
  try {
    await withDeadline(run, PROBE_TIMEOUT_MS)
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch {
    /*
     * The error is swallowed HERE rather than at the route, so no caller can print it by
     * accident. A refused Postgres connection reports back with the connection string in it —
     * user, host, database — and `/api/ready` is public because a load balancer cannot hold a
     * credential.
     *
     * The latency of a failure is still worth returning: a refusal in 2ms is a closed port,
     * one in 5s is a saturated pool, and those have different fixes.
     */
    return { ok: false, latencyMs: Date.now() - startedAt }
  }
}

/**
 * Can this process reach the database, through the pooler a real request uses?
 *
 * Deliberately not a direct connection. A green check that bypassed PgBouncer would prove the
 * database is up and say nothing about whether the app can reach it, which is the question.
 */
export const pingDatabase = (): Promise<Probe> => timed(() => db.execute(sql`select 1`))

export const pingRedis = (): Promise<Probe> => timed(async () => getRedis().ping())

export interface SchedulerSilence {
  /** No task has ever recorded a run: a fresh deployment, not an outage. */
  unproven: boolean
  /** When this deployment first recorded ANY run — the baseline a never-run task is aged from. */
  observedSince: Date | null
  silent: { task: string; silentMinutes: number; neverRun: boolean }[]
}

/**
 * Has every scheduled task fired somewhere recently?
 *
 * The check the in-worker `core.job_health` task cannot make, because it IS the worker: if
 * everything stops, that task stops with it and nobody is told.
 *
 * Coarse on purpose — "has this task succeeded anywhere", not "is every tenant being served".
 * One company's slow night must not turn a whole deployment red, so the budget is looser than
 * the per-company job's and the detail and the alert stay with that job.
 */
export async function schedulerSilence(input: {
  /**
   * The schedule this deployment ACTUALLY runs — see `activeScheduledTasks`.
   *
   * Task AND pattern, because the budget is derived from the interval: a five-minute task
   * quiet for an hour is an outage and a monthly one quiet for an hour is a Tuesday.
   */
  expectations: readonly TaskExpectation[]
  policy: { toleranceFactor: number; floorMinutes: number }
  now?: Date
}): Promise<SchedulerSilence> {
  const now = input.now ?? new Date()

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

  if (lastSuccess.size === 0) return { unproven: true, observedSince: null, silent: [] }

  const observed = await db.execute<{ observed_since: string | null }>(
    sql`select app.scheduler_observed_since() as observed_since`,
  )
  const observedRows = Array.isArray(observed)
    ? observed
    : ((observed as { rows?: unknown[] }).rows ?? [])
  const rawSince = (observedRows as { observed_since: string | null }[])[0]?.observed_since

  /*
   * A worker that started ten minutes ago has fired its five-minute tasks and none of its
   * nightly ones. Measuring a never-run task as infinitely stale reported that healthy
   * deployment as an outage — for a day on every daily task and a month on every monthly one.
   * Nothing can have been provably quiet for longer than we have been listening.
   *
   * The `?? now` cannot be reached (rows exist, or the branch above returned) and is the safe
   * direction anyway: it makes every never-run task look brand new.
   */
  const observedSince = rawSince ? new Date(rawSince) : now

  const stale = staleTasks({
    expectations: input.expectations,
    lastSuccessAt: Object.fromEntries(lastSuccess),
    now,
    watchingSince: observedSince,
    policy: input.policy,
  })

  return {
    unproven: false,
    observedSince,
    silent: stale.map((entry) => ({
      task: entry.task,
      silentMinutes: entry.silentMinutes,
      neverRun: entry.neverRun,
    })),
  }
}
