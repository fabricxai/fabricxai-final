/**
 * Scheduled derivations (architecture §5; brief 1.3 §Events / jobs).
 *
 * Two stages on purpose:
 *
 *   `schedule` queue — one repeatable job per task, fires on a cron, does nothing but
 *                      enumerate live companies and fan out.
 *   `derive` queue   — one job per (company, task), runs the actual work scoped to that
 *                      tenant.
 *
 * Running the work inline in the cron handler would be simpler and wrong: one company
 * with a large order book would block every other company's nightly scan behind it, and
 * a failure halfway through would leave half the tenants processed with no way to retry
 * just the rest. Fanned out, each company retries independently.
 *
 * Times are Asia/Dhaka. "Nightly" has to mean night *at the factory* — a scan that runs
 * at 02:00 UTC lands at 08:00 in Dhaka, which is when the floor is starting, not idle.
 */
import type { Job } from 'bullmq'
import { sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { runLcCountdown, runTnaScan } from '@/modules/orders/jobs'
import type { SystemCtx } from '@/modules/core/ctx'

import { getQueue, QUEUE } from '../queues'

const FACTORY_TZ = 'Asia/Dhaka'

/**
 * The nightly tasks. Adding one is a line here plus a branch in `runDeriveTask` — the
 * schedule is data, so what runs when is answerable by reading one array.
 */
export const SCHEDULED_TASKS = [
  {
    id: 'tna-scan-nightly',
    task: 'orders.tna_scan',
    // 01:30 Dhaka: after the night shift's entries have landed, before the day starts.
    pattern: '30 1 * * *',
  },
  {
    id: 'lc-countdown-nightly',
    task: 'commercial.lc_countdown',
    // 02:00 Dhaka, so the commercial team finds the countdown waiting at 09:00.
    pattern: '0 2 * * *',
  },
] as const

export type ScheduledTask = (typeof SCHEDULED_TASKS)[number]['task']

export interface DeriveJobData {
  companyId: string
  task: ScheduledTask
}

/**
 * Register the repeatable jobs. Idempotent by scheduler id, so a worker restart or a
 * second worker does not create duplicates — which is the failure mode that turns a
 * nightly digest into four identical emails.
 */
export async function registerSchedules(): Promise<void> {
  const queue = getQueue(QUEUE.schedule)

  for (const scheduled of SCHEDULED_TASKS) {
    await queue.upsertJobScheduler(
      scheduled.id,
      { pattern: scheduled.pattern, tz: FACTORY_TZ },
      { name: scheduled.task, data: { task: scheduled.task } },
    )
  }

  console.log(`[scheduler] ${SCHEDULED_TASKS.length} schedule(s) registered (${FACTORY_TZ})`)
}

/** Live company ids, via the narrow SECURITY DEFINER function from migration 0011. */
async function activeCompanyIds(): Promise<string[]> {
  const result = await db.execute<{ company_id: string }>(
    sql`select company_id from app.active_company_ids()`,
  )
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return (rows as { company_id: string }[]).map((row) => row.company_id)
}

/**
 * Cron handler: fan one task out to every live company.
 *
 * The job id is deterministic — task + company + date — so a cron that fires twice
 * (clock adjustment, two workers racing a restart) enqueues the same job id and BullMQ
 * drops the duplicate.
 */
export async function fanOutScheduledTask(job: Job<{ task: ScheduledTask }>): Promise<number> {
  const companies = await activeCompanyIds()
  const derive = getQueue(QUEUE.derive)
  const runDate = new Date().toISOString().slice(0, 10)

  for (const companyId of companies) {
    await derive.add(
      job.data.task,
      { companyId, task: job.data.task } satisfies DeriveJobData,
      { jobId: `${job.data.task}:${companyId}:${runDate}` },
    )
  }

  console.log(`[scheduler] ${job.data.task} → ${companies.length} company/companies`)
  return companies.length
}

/**
 * Derive handler: the actual work, scoped to one tenant.
 *
 * `systemCtx` here is not a privilege escalation — it is a company-scoped context with no
 * user, so RLS binds this exactly as it binds a request. The `owner` role is what lets
 * the job write derived rows the way an owner could; it grants nothing across companies.
 */
export async function runDeriveTask(job: Job<DeriveJobData>): Promise<unknown> {
  const ctx: SystemCtx = {
    companyId: job.data.companyId,
    userId: null,
    roles: ['owner'],
    system: true,
    jobId: job.id ?? undefined,
  }

  switch (job.data.task) {
    case 'orders.tna_scan':
      return runTnaScan(ctx)
    case 'commercial.lc_countdown':
      return runLcCountdown(ctx)
    default: {
      // Exhaustiveness: a task added to SCHEDULED_TASKS without a branch here fails to
      // compile rather than silently doing nothing every night.
      const unhandled: never = job.data.task
      throw new Error(`no handler for scheduled task "${String(unhandled)}"`)
    }
  }
}
