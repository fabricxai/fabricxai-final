/**
 * Recording what the scheduler actually did.
 *
 * Every scheduled task runs through `recordRun`, which writes a row when it starts and
 * closes it when it ends. That row is the only evidence a task ran at all — and its absence
 * is the only evidence one stopped.
 *
 * ## Two ordering decisions
 *
 * **The start row is written before the work, in its own transaction.** A task that dies
 * mid-flight then leaves a `running` row rather than nothing, which distinguishes "stuck
 * for three hours" from "never began" — different problems with different fixes.
 *
 * **A failure in the RECORDING never fails the task.** If the row cannot be written, the
 * TNA scan should still run: observability that can take down the thing it observes is a
 * net loss. It is logged loudly instead, and the staleness check will notice the gap
 * anyway, which is exactly what it is for.
 */
import { and, desc, eq, lt, notInArray, sql } from 'drizzle-orm'

import { jobRuns } from '@/db/schema/core'

import type { AnyCtx } from './ctx'
import { withTenantRead, withTenantTx } from './tenancy'

/** What a run ended as. `skipped` is neither — see `declinedToRun`. */
export type RunStatus = 'succeeded' | 'failed' | 'skipped'

export interface RunRecord {
  runId: string | null
  status: RunStatus
  durationMs: number
}

/** Result payloads are small counts; anything larger is a bug in the task, not data. */
const MAX_RESULT_BYTES = 4_000

function summarise(result: unknown): Record<string, unknown> | null {
  if (result === null || result === undefined) return null
  if (typeof result !== 'object') return { value: String(result) }

  const json = JSON.stringify(result)
  if (json.length > MAX_RESULT_BYTES) {
    // Truncated rather than dropped: knowing a task returned something enormous is itself
    // worth recording, and storing it would make the table the problem.
    return { truncated: true, bytes: json.length }
  }
  return result as Record<string, unknown>
}

/**
 * Run a scheduled task and record the attempt.
 *
 * Re-throws whatever the task threw, after recording it — BullMQ's retry and the worker's
 * failure log both still see the real error. This wrapper observes; it does not swallow.
 */
export async function recordRun<T>(
  ctx: AnyCtx,
  input: { task: string; jobId?: string },
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()
  const runId = await openRun(ctx, input)

  try {
    const result = await run()
    await closeRun(ctx, runId, {
      // A task that declined to do anything is not a success (plan 6.1). The extraction
      // runner returns `{ skipped: '…' }` when no provider is registered — it does not
      // throw, because the backlog is intact and will run when one is configured — and
      // recording that as `succeeded` is what made job health report green while documents
      // piled up unread. `lastSuccessByTask` counts only `succeeded`, so a run of skips now
      // ages exactly like silence, which is what it is.
      status: declinedToRun(result) ? 'skipped' : 'succeeded',
      durationMs: Date.now() - startedAt,
      result: summarise(result),
      error: null,
    })
    return result
  } catch (error) {
    await closeRun(ctx, runId, {
      status: 'failed',
      durationMs: Date.now() - startedAt,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Did the task decline to do anything?
 *
 * A `skipped` field carrying a REASON, which is the shape `runQueuedExtractions` already
 * used before anything read it. Deliberately not "returned nothing" or "did zero work": a
 * nightly scan that legitimately finds no late milestones has succeeded, and conflating the
 * two would turn every quiet night into an alarm.
 */
function declinedToRun(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'skipped' in result &&
    Boolean((result as { skipped?: unknown }).skipped)
  )
}

async function openRun(ctx: AnyCtx, input: { task: string; jobId?: string }): Promise<string | null> {
  try {
    return await withTenantTx(ctx, async (tx) => {
      const [row] = await tx
        .insert(jobRuns)
        .values({
          companyId: ctx.companyId,
          task: input.task,
          status: 'running',
          startedAt: new Date(),
          jobId: input.jobId ?? null,
        })
        .returning({ id: jobRuns.id })

      return row?.id ?? null
    })
  } catch (error) {
    // Observability must not take down the thing it observes.
    console.error(`[job-runs] could not open a run row for ${input.task}:`, error)
    return null
  }
}

async function closeRun(
  ctx: AnyCtx,
  runId: string | null,
  outcome: {
    status: RunStatus
    durationMs: number
    result: Record<string, unknown> | null
    error: string | null
  },
): Promise<void> {
  if (!runId) return

  try {
    await withTenantTx(ctx, async (tx) => {
      await tx
        .update(jobRuns)
        .set({ ...outcome, finishedAt: new Date() })
        .where(eq(jobRuns.id, runId))
    })
  } catch (error) {
    console.error(`[job-runs] could not close run ${runId}:`, error)
  }
}

/** When each task last SUCCEEDED for this company. A failed run is not a run. */
export async function lastSuccessByTask(ctx: AnyCtx): Promise<Record<string, Date>> {
  const rows = await withTenantRead(ctx, async (tx) =>
    tx
      .select({
        task: jobRuns.task,
        lastSuccessAt: sql<string>`max(${jobRuns.finishedAt})`,
      })
      .from(jobRuns)
      .where(eq(jobRuns.status, 'succeeded'))
      .groupBy(jobRuns.task),
  )

  const byTask: Record<string, Date> = {}
  for (const row of rows) {
    if (row.lastSuccessAt) byTask[row.task] = new Date(row.lastSuccessAt)
  }
  return byTask
}

export interface StuckRun {
  runId: string
  task: string
  startedAt: Date
  minutesRunning: number
}

/**
 * Runs that started and never finished.
 *
 * A different failure from a task that stopped firing, and it needs saying separately: the
 * schedule is alive, the work began, and something is holding it. A staleness check alone
 * would report the task as merely silent and send somebody looking at the scheduler.
 */
export async function stuckRuns(
  ctx: AnyCtx,
  olderThanMinutes: number,
  now = new Date(),
): Promise<StuckRun[]> {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000)

  const rows = await withTenantRead(ctx, async (tx) =>
    tx
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.status, 'running'), lt(jobRuns.startedAt, cutoff)))
      .orderBy(desc(jobRuns.startedAt)),
  )

  return rows.map((row) => ({
    runId: row.id,
    task: row.task,
    startedAt: row.startedAt,
    minutesRunning: Math.floor((now.getTime() - row.startedAt.getTime()) / 60_000),
  }))
}

export interface PruneResult {
  deleted: number
  keptSince: string
}

/**
 * Drop run rows older than the retention window.
 *
 * The five-minute tasks alone produce 288 rows a day per company. Unbounded, the table
 * would eventually make `lastSuccessByTask` — the query that watches everything else —
 * the slowest thing in the system.
 *
 * The most recent SUCCESS per task is always kept, whatever its age. Pruning it would make
 * a task that has not run in months look like one that has never run, and the distinction
 * between those two is most of what the staleness report is telling you.
 */
export async function pruneJobRuns(
  ctx: AnyCtx,
  retentionDays: number,
  now = new Date(),
): Promise<PruneResult> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000)

  return withTenantTx(ctx, async (tx) => {
    const keep = await tx
      .select({ id: sql<string>`distinct on (${jobRuns.task}) ${jobRuns.id}` })
      .from(jobRuns)
      .where(eq(jobRuns.status, 'succeeded'))
      .orderBy(jobRuns.task, desc(jobRuns.finishedAt))

    const keepIds = keep.map((row) => row.id)

    const deleted = await tx
      .delete(jobRuns)
      .where(
        and(
          lt(jobRuns.startedAt, cutoff),
          // Bound through drizzle rather than hand-written `<> all(...)`: an array passed
          // into a raw fragment arrives as a single scalar and Postgres rejects it.
          keepIds.length > 0 ? notInArray(jobRuns.id, keepIds) : undefined,
        ),
      )
      .returning({ id: jobRuns.id })

    return { deleted: deleted.length, keptSince: cutoff.toISOString() }
  })
}

/**
 * Prune the worker's own bookkeeping: published outbox rows and consumer dedupe rows.
 *
 * Both tables grew forever (audit DB-M1, DB-M2) — nearly 2,000 published events and 4,000
 * dedupe rows on a demo database, none of which answer a question anybody asks once a
 * redelivery is no longer plausible.
 *
 * Through the definer functions from migration 0072 rather than a `delete` here, because
 * the app role has no DELETE on `outbox` by design: nothing serving a request should be
 * able to remove an event whose consequences have not happened yet. The functions enforce
 * the safety property (published only, never a parked failure), so this is the schedule
 * and the retention, not the rule.
 */
export async function pruneWorkerBookkeeping(
  ctx: AnyCtx,
  retentionDays: number,
  now = new Date(),
): Promise<{ outbox: number; processedEvents: number; keptSince: string }> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000)

  return withTenantTx(ctx, async (tx) => {
    const outboxRows = await tx.execute<{ removed: string }>(
      sql`select app.prune_outbox(${cutoff.toISOString()}) as removed`,
    )
    const eventRows = await tx.execute<{ removed: string }>(
      sql`select app.prune_processed_events(${cutoff.toISOString()}) as removed`,
    )

    const count = (result: unknown): number => {
      const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
      return Number((rows[0] as { removed: string } | undefined)?.removed ?? 0)
    }

    return {
      outbox: count(outboxRows),
      processedEvents: count(eventRows),
      keptSince: cutoff.toISOString(),
    }
  })
}
