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
import { runUdAlerts } from '@/modules/commercial/jobs'
import { deliverCritical, deliverDigest, type DeliveryPolicy } from '@/modules/core/delivery'
import { runCapEscalations, runCertificateAlerts } from '@/modules/compliance/jobs'
import type { CompliancePolicy } from '@/modules/compliance/service'
import type { SystemCtx } from '@/modules/core/ctx'
import {
  runBreakdownReport,
  runDowntimeCosts,
  runLowStockAlerts,
  runPmDueAlerts,
  type StoredMaintenancePolicy,
} from '@/modules/maintenance/jobs'
import { runQueuedExtractions } from '@/modules/marbim/jobs'
import type { MarbimPolicy } from '@/modules/marbim/service'
import { runStyleEmbedSweep } from '@/modules/memory/jobs'
import { runLcCountdown, runTnaScan } from '@/modules/orders/jobs'
import { ensureOutputPartitions, runDayClose } from '@/modules/production/jobs'
import { getPolicy } from '@/modules/settings/service'
import { sendNotificationEmail } from '@/lib/mailer'

import { refreshExceptionsFeed } from './exceptions-feed'

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
  {
    id: 'partitions-nightly',
    task: 'production.ensure_partitions',
    // 00:30 Dhaka, before anything else. If the monthly window has run out, every write
    // for the rest of the night lands in the DEFAULT partition and stops being pruned.
    pattern: '30 0 * * *',
  },
  {
    id: 'day-close-nightly',
    task: 'production.day_close',
    // 01:00 Dhaka: after the night shift's last entries, before the TNA scan reads them.
    pattern: '0 1 * * *',
  },
  {
    id: 'ud-alerts-nightly',
    task: 'commercial.ud_alerts',
    // 02:15 Dhaka: after the LC countdown, before the store opens. Expiring bonded
    // declarations stop a warehouse issuing anything, so the storekeeper needs to
    // know at the start of the shift rather than halfway through it.
    pattern: '15 2 * * *',
  },

  // ── 10.2 Compliance ──
  {
    id: 'certificate-alerts-nightly',
    task: 'compliance.certificate_alerts',
    // 02:30 Dhaka. A lapsed fire licence is a factory operating without one, and the
    // compliance officer should find it at the start of the day rather than at an audit.
    pattern: '30 2 * * *',
  },
  {
    id: 'cap-escalations-nightly',
    task: 'compliance.cap_escalations',
    // 02:45 Dhaka, after the certificate scan — both land in the same morning review.
    pattern: '45 2 * * *',
  },

  // ── 9.1 Maintenance ──
  {
    id: 'pm-due-nightly',
    task: 'maintenance.pm_due',
    // 03:00 Dhaka: the due-list is what the maintenance team works from when the shift
    // starts, so it has to exist before they arrive.
    pattern: '0 3 * * *',
  },
  {
    id: 'low-stock-nightly',
    task: 'maintenance.low_stock',
    // 03:15 Dhaka, with the PM list — a service due tomorrow and no looper on the shelf
    // are the same conversation.
    pattern: '15 3 * * *',
  },
  {
    id: 'downtime-costs-monthly',
    task: 'maintenance.downtime_costs',
    // 04:00 Dhaka on the 1st, for the month just ended. Waiting until the 2nd would be
    // safer against late entries, but the figure is an estimate for a management report,
    // and it is recomputed idempotently if it is run again.
    pattern: '0 4 1 * *',
  },
  {
    id: 'breakdown-outliers-monthly',
    task: 'maintenance.breakdown_report',
    // 04:30 Dhaka on the 1st, after the costs are in.
    pattern: '30 4 1 * *',
  },

  // ── 1.6 Order Memory ──
  {
    id: 'style-embed-sweep-nightly',
    task: 'memory.embed_styles',
    // 03:30 Dhaka. A sweep rather than an event consumer, so a style created while the
    // model provider was down is picked up on the next run instead of never.
    pattern: '30 3 * * *',
  },

  // ── X.2 MARBIM ──
  {
    id: 'extractions-every-5-min',
    task: 'marbim.run_extractions',
    // Every five minutes, all day. An extraction is somebody waiting for a tech pack to
    // become a draft; nightly would make the feature useless.
    pattern: '*/5 * * * *',
  },

  // ── Core · notification delivery ──
  {
    id: 'notify-critical-every-5-min',
    task: 'core.deliver_critical',
    // Every five minutes. A lapsed fire licence or a corrective action that reached the
    // owner is worth an interruption; waiting for a nightly digest is not.
    pattern: '*/5 * * * *',
  },
  {
    id: 'notify-digest-daily',
    task: 'core.deliver_digest',
    // 08:00 Dhaka, so it is waiting when people arrive rather than landing at 3am. One
    // email per person covering everything they were not interrupted for.
    pattern: '0 8 * * *',
  },

  // ── 11.2 Analytics ──
  {
    id: 'exceptions-feed-quarter-hourly',
    task: 'analytics.exceptions_refresh',
    // Every fifteen minutes. This drives "what is wrong right now"; the feed carries its
    // own as-of stamp, so a stale one is visible rather than misleading.
    pattern: '*/15 * * * *',
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

/**
 * The factory's today.
 *
 * Deriving "today" from the server clock would put a 03:00 Dhaka job on the previous
 * calendar date in UTC, so a certificate expiring today would be reported as expiring
 * tomorrow — for one day, every day.
 */
function factoryToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FACTORY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
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

  // Keyed on the FIRE, not on the date.
  //
  // `job.timestamp` is when this particular scheduled job was created, so every fire of a
  // cron gets its own slot and any retry of that same fire reuses it — which is what makes
  // the dedupe work without swallowing legitimate repeats.
  //
  // The previous key was the calendar date. That was correct while every task was nightly
  // and silently wrong the moment one was not: a task on `*/5 * * * *` would have run once
  // and had its remaining 287 fires that day dropped as duplicates.
  // A real BullMQ job always carries a timestamp; the fallback only affects hand-built
  // jobs, and a retry of one of those is not a thing that happens in production.
  //
  // The colon is stripped from the time deliberately: BullMQ accepts a custom job id
  // containing colons ONLY when it splits into exactly three parts, so `08:00` inside the
  // third segment makes it four and the queue rejects the whole fan-out at runtime.
  const slot = new Date(job.timestamp ?? Date.now()).toISOString().slice(0, 16).replace(':', '-')

  for (const companyId of companies) {
    await derive.add(
      job.data.task,
      { companyId, task: job.data.task } satisfies DeriveJobData,
      { jobId: `${job.data.task}:${companyId}:${slot}` },
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

  // Policy comes from Settings HERE, in the worker, and is passed down as an argument.
  // A module never imports Settings — that is what keeps services testable without a
  // database and keeps the dependency pointing one way (X.3's own note on the registry).
  const today = factoryToday()

  switch (job.data.task) {
    case 'orders.tna_scan':
      return runTnaScan(ctx)
    case 'commercial.lc_countdown':
      return runLcCountdown(ctx)
    case 'commercial.ud_alerts':
      return runUdAlerts(ctx)
    case 'production.ensure_partitions':
      return ensureOutputPartitions(ctx)
    case 'production.day_close':
      return runDayClose(ctx)

    case 'compliance.certificate_alerts':
      return runCertificateAlerts(ctx, { today }, await getPolicy<CompliancePolicy>(ctx, 'compliance'))
    case 'compliance.cap_escalations':
      return runCapEscalations(ctx, { today })

    case 'maintenance.pm_due':
      return runPmDueAlerts(ctx, { today })
    case 'maintenance.low_stock':
      return runLowStockAlerts(ctx)
    case 'maintenance.downtime_costs':
      return runDowntimeCosts(
        ctx,
        { today },
        await getPolicy<StoredMaintenancePolicy>(ctx, 'maintenance'),
      )
    case 'maintenance.breakdown_report':
      return runBreakdownReport(
        ctx,
        { today },
        await getPolicy<StoredMaintenancePolicy>(ctx, 'maintenance'),
      )

    case 'memory.embed_styles':
      return runStyleEmbedSweep(ctx)

    case 'marbim.run_extractions':
      return runQueuedExtractions(ctx, await getPolicy<MarbimPolicy>(ctx, 'marbim'))

    case 'analytics.exceptions_refresh':
      return refreshExceptionsFeed(ctx, today)

    case 'core.deliver_critical':
      return deliverCritical(
        ctx,
        await getPolicy<DeliveryPolicy>(ctx, 'delivery'),
        sendNotificationEmail,
      )
    case 'core.deliver_digest':
      return deliverDigest(
        ctx,
        await getPolicy<DeliveryPolicy>(ctx, 'delivery'),
        sendNotificationEmail,
      )
    default: {
      // Exhaustiveness: a task added to SCHEDULED_TASKS without a branch here fails to
      // compile rather than silently doing nothing every night.
      const unhandled: never = job.data.task
      throw new Error(`no handler for scheduled task "${String(unhandled)}"`)
    }
  }
}
