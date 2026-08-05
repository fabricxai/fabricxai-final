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
import { emitAgingEscalations } from '@/modules/approvals/service'
import type { ApprovalsPolicy } from '@/modules/approvals/service'
import { runUdAlerts } from '@/modules/commercial/jobs'
import { expireLapsedUds } from '@/modules/commercial/service'
import { emitCashShortfall } from '@/modules/finance/service'
import { emitPpBlocking } from '@/modules/sampling/service'
import type { SamplingPolicy } from '@/modules/sampling/service'
import { emitLatestShipmentCountdown } from '@/modules/shipment/service'
import { deliverCritical, deliverDigest, type DeliveryPolicy } from '@/modules/core/delivery'
import { runJobHealthCheck, type JobHealthPolicy } from '@/modules/core/job-health-job'
import { pruneJobRuns, pruneWorkerBookkeeping, recordRun } from '@/modules/core/job-runs'
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
import { computeSupplierScores } from '@/modules/procurement/service'
import { runLcCountdown, runTnaScan } from '@/modules/orders/jobs'
import {
  ensureOutputPartitions,
  runDayClose,
  runRunRateAlerts,
  snapshotWip,
} from '@/modules/production/jobs'
import { runQualityDayClose, runRepeatDefectAlerts } from '@/modules/quality/jobs'
import type { QualityPolicy } from '@/modules/quality/service'
import { getPolicy } from '@/modules/settings/service'
import { sendNotificationEmail } from '@/lib/mailer'

import { refreshExceptionsFeed } from './exceptions-feed'

import { getQueue, QUEUE } from '../queues'
import { factoryToday } from '@/lib/dates'

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
    id: 'run-rate-alerts-nightly',
    task: 'production.run_rate_alerts',
    // 01:30 Dhaka — after day-close has settled yesterday's output, so the forecast is made
    // from a complete trailing window rather than a day that is still being written to.
    pattern: '30 1 * * *',
  },
  {
    id: 'quality-day-close-nightly',
    task: 'quality.day_close',
    // 01:15 Dhaka, after production's day-close. `dhu_daily` is what the fourteen-day trend
    // and every buyer report read, so it has to exist before anybody opens either.
    pattern: '15 1 * * *',
  },
  {
    id: 'repeat-defects-nightly',
    task: 'quality.repeat_defects',
    // 01:45 Dhaka, after the DHU close — a run is only visible once the days it spans are
    // closed, and a scan that ran first would be one day short every night.
    pattern: '45 1 * * *',
  },
  {
    id: 'wip-snapshot-hourly',
    task: 'production.snapshot_wip',
    // Every hour on the half hour. The brief calls for an hourly WIP snapshot and it was
    // never scheduled — so `wip_snapshots` stayed empty and the owner dashboard's cut/sewn/
    // finished figures had nothing behind them.
    pattern: '30 * * * *',
  },
  {
    id: 'pp-blocking-nightly',
    task: 'sampling.pp_blocking',
    // 03:00 Dhaka. A PP sample that has not come back blocks a cutting start, and the floor
    // finds out on the morning it cannot spread a lay. This is the alert that gets a
    // merchandiser onto the buyer the week before instead.
    pattern: '0 3 * * *',
  },
  {
    id: 'latest-shipment-nightly',
    task: 'shipment.latest_shipment',
    // 02:45 Dhaka, before the commercial team's day. A shipment that misses the LC's
    // latest-shipment date is a discrepancy the bank raises and the factory argues about
    // for weeks — the countdown is the only cheap moment to act on it.
    pattern: '45 2 * * *',
  },
  {
    id: 'expire-lapsed-uds-nightly',
    task: 'commercial.expire_uds',
    // 00:45 Dhaka. A UD whose validity has run out must stop being drawable that same day —
    // the gate reads status, and a lapsed declaration left `active` is duty-free material
    // the factory is no longer entitled to issue.
    pattern: '45 0 * * *',
  },
  {
    id: 'approval-aging-nightly',
    task: 'approvals.aging_escalations',
    // 04:00 Dhaka. A draft nobody has looked at is a decision nobody has made, and the whole
    // propose→approve loop degrades into a queue people stop opening.
    pattern: '0 4 * * *',
  },
  {
    id: 'cash-shortfall-nightly',
    task: 'finance.cash_shortfall',
    // 05:00 Dhaka, so the owner's morning digest already carries it. The week cash first
    // goes negative is the most actionable figure the finance module produces, and it is
    // only useful while there is still time to move a payment.
    pattern: '0 5 * * *',
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

  // ── 3.2 Procurement ──
  {
    id: 'supplier-scores-nightly',
    task: 'procurement.score_suppliers',
    /*
     * Nightly, for the month in progress — not monthly on the 1st.
     *
     * The scorecard's job is to be true when somebody is choosing a supplier, and that
     * happens on the 14th as often as the 2nd. A monthly run would leave the current month
     * blank for up to thirty days, which reads as "this supplier has done nothing" rather
     * than "nobody has computed it yet" — and the screen cannot tell those apart.
     *
     * Recomputing the same period is safe: the write is an upsert keyed on
     * (supplier, period).
     */
    pattern: '20 2 * * *',
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

  // ── Core · watching the schedule itself ──
  {
    id: 'job-health-hourly',
    task: 'core.job_health',
    // Hourly. Frequent enough to catch a five-minute task within the hour, rare enough
    // that a scheduler which has been down all night sends one alert and not twelve.
    pattern: '0 * * * *',
  },
  {
    id: 'prune-job-runs-nightly',
    task: 'core.prune_job_runs',
    // 05:00 Dhaka, after the monthly reports. The five-minute tasks alone are 288 rows a
    // day per company, and the query that watches everything else reads this table.
    pattern: '0 5 * * *',
  },
  {
    id: 'prune-worker-bookkeeping-nightly',
    task: 'core.prune_worker_bookkeeping',
    // 05:15 Dhaka, just after the job-run prune and well clear of the night shift. Both
    // tables it touches are worker bookkeeping that grew forever until now (audit DB-M1,
    // DB-M2); neither is read by anything a person is waiting for, so this is deliberately
    // the least urgent thing on the schedule.
    pattern: '15 5 * * *',
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
 * When this company was created — the anchor a never-run task is measured from.
 *
 * Read through the same scoped path as everything else, so it is the caller's own company
 * or nothing.
 */
async function companyCreatedAt(companyId: string): Promise<Date> {
  const result = await db.execute<{ created_at: string }>(
    sql`select created_at from companies where id = ${companyId}`,
  )
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  const row = (rows as { created_at: string }[])[0]
  // A company that does not exist cannot have stale jobs; the epoch would report every
  // task as silent since 1970, so treat it as brand new instead.
  return row ? new Date(row.created_at) : new Date()
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

  // Every task, without exception. A task that ran but left no row is indistinguishable
  // from one that never ran, which is the whole failure `core.job_health` exists to catch —
  // so the recording wraps the switch rather than being called inside each branch.
  return recordRun(ctx, { task: job.data.task, jobId: job.id ?? undefined }, () =>
    dispatchTask(ctx, job.data.task),
  )
}

async function dispatchTask(ctx: SystemCtx, task: ScheduledTask): Promise<unknown> {

  // Policy comes from Settings HERE, in the worker, and is passed down as an argument.
  // A module never imports Settings — that is what keeps services testable without a
  // database and keeps the dependency pointing one way (X.3's own note on the registry).
  const today = factoryToday()

  switch (task) {
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
    case 'production.run_rate_alerts':
      return runRunRateAlerts(ctx, { today })
    case 'production.snapshot_wip':
      return snapshotWip(ctx)
    case 'sampling.pp_blocking':
      return emitPpBlocking(ctx, { today }, await getPolicy<SamplingPolicy>(ctx, 'sampling'))
    case 'shipment.latest_shipment':
      // 21 days is the usual presentation period; a shipment inside that window with an
      // unmet latest-shipment date is the one worth waking somebody for.
      return emitLatestShipmentCountdown(ctx, { today, withinDays: 21 })
    case 'commercial.expire_uds':
      return expireLapsedUds(ctx, { today })
    case 'approvals.aging_escalations':
      return emitAgingEscalations(
        ctx,
        { now: new Date(`${today}T00:00:00Z`) },
        await getPolicy<ApprovalsPolicy>(ctx, 'approvals'),
      )
    case 'finance.cash_shortfall':
      return emitCashShortfall(ctx, { from: today, weeks: 8, currency: 'USD' })
    case 'quality.day_close':
      return runQualityDayClose(ctx, {}, await getPolicy<QualityPolicy>(ctx, 'quality'))
    case 'quality.repeat_defects':
      return runRepeatDefectAlerts(ctx, { today }, await getPolicy<QualityPolicy>(ctx, 'quality'))

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

    case 'procurement.score_suppliers':
      // The month `today` falls in. Scoring a period that has not finished is the point —
      // see the schedule note.
      return computeSupplierScores(ctx, { period: `${today.slice(0, 7)}-01` })

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

    case 'core.job_health':
      return runJobHealthCheck(
        ctx,
        {
          // The LIVE schedule, not a copy of it. A task is monitored by the act of being
          // scheduled, and stops being reported by the act of being removed.
          expectations: SCHEDULED_TASKS.map((scheduled) => ({
            task: scheduled.task,
            pattern: scheduled.pattern,
          })),
          companyCreatedAt: await companyCreatedAt(ctx.companyId),
        },
        await getPolicy<JobHealthPolicy>(ctx, 'job_health'),
      )

    case 'core.prune_job_runs':
      return pruneJobRuns(ctx, (await getPolicy<{ retentionDays: number }>(ctx, 'job_health')).retentionDays)

    case 'core.prune_worker_bookkeeping':
      // Shares the job-health retention window: both answer "how far back does the
      // worker's own history go", and two numbers to keep in step would drift.
      return pruneWorkerBookkeeping(
        ctx,
        (await getPolicy<{ retentionDays: number }>(ctx, 'job_health')).retentionDays,
      )
    default: {
      // Exhaustiveness: a task added to SCHEDULED_TASKS without a branch here fails to
      // compile rather than silently doing nothing every night.
      const unhandled: never = task
      throw new Error(`no handler for scheduled task "${String(unhandled)}"`)
    }
  }
}
