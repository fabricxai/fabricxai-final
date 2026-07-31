/**
 * Scheduled work for 9.1 (brief §Jobs: PM due generation, breakdown-frequency outlier
 * report) plus the monthly downtime cost run.
 *
 * Every job here is company-scoped, idempotent, and takes its policy as an argument — the
 * worker reads it from Settings and passes it down, so a module never imports Settings and
 * the dependency keeps pointing one way.
 *
 * ## The thing these jobs have to get right
 *
 * A nightly alert that fires every night is an alert people turn off. Each notification
 * below carries a `dedupeKey` chosen so it fires ONCE per real change of state:
 *
 *  - a PM due on the 10th alerts once, not once for every day it stays overdue;
 *  - a machine that has NEVER been serviced alerts once, not every night — its due date is
 *    "today", which moves, so keying on the date would produce a fresh alert daily forever;
 *  - the outlier report alerts once per month it finds something.
 *
 * And when a figure cannot be produced, that is itself reported. A month with no
 * downtime-cost row because nobody configured a line-minute rate is a gap somebody should
 * be told about, not a silent zero.
 */
import { money } from '@/lib/money'

import type { SystemCtx } from '../core/ctx'
import { notify } from '../core/notifications'

import {
  breakdownReport,
  compileMonthlyDowntimeCosts,
  lowStock,
  pmDue,
  type MaintenancePolicy,
} from './service'

/** What Settings stores. The rate is optional there and required here — see below. */
export interface StoredMaintenancePolicy {
  minFleetTickets: number
  outlierMultiple: number
  outlierMinTickets: number
  lineValuePerMinute?: { amount: string; currency: string }
}

/** Overdue by more than this and it stops being a reminder. */
const PM_CRITICAL_DAYS = 7

export interface PmAlertResult {
  due: number
  alerted: number
}

/**
 * Tell maintenance what is due today or already overdue.
 *
 * The dedupe key is the interesting part. For a machine with a service history it is the
 * DUE DATE, so one alert covers the whole time it stays overdue and the next cycle raises a
 * fresh one. For a machine that has never been serviced there is no meaningful due date —
 * `pmDue` correctly reports it as due today, and today moves — so those key on the machine
 * and schedule alone. Without that, every unserviced machine in the factory would send an
 * identical notification every single night.
 */
export async function runPmDueAlerts(
  ctx: SystemCtx,
  input: { today: string },
): Promise<PmAlertResult> {
  const due = await pmDue(ctx, input.today)
  let alerted = 0

  for (const entry of due) {
    const created = await notify(ctx, {
      role: 'maintenance',
      kind: 'maintenance.pm.due',
      severity: entry.daysOverdue >= PM_CRITICAL_DAYS ? 'critical' : 'warning',
      titleKey: 'maintenance.notifications.pm_due.title',
      params: {
        machineType: entry.machineType,
        dueOn: entry.dueOn,
        daysOverdue: entry.daysOverdue,
        neverServiced: entry.neverServiced,
      },
      moduleId: 'maintenance',
      entityTable: 'machines',
      entityId: entry.machineId,
      dedupeKey: entry.neverServiced
        ? `pm.due:${entry.scheduleId}:${entry.machineId}:never`
        : `pm.due:${entry.scheduleId}:${entry.machineId}:${entry.dueOn}`,
    })

    if (created) alerted += 1
  }

  return { due: due.length, alerted }
}

/** First day of the month before the one containing `today`. */
export function previousMonthStart(today: string): string {
  const date = new Date(`${today}T00:00:00Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10)
}

/** Last day of the month starting at `monthStart`. */
function monthEnd(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10)
}

export interface OutlierReportResult {
  month: string
  outliers: number
  alerted: boolean
}

/**
 * Once a month: which machines broke down far more than the typical one.
 *
 * Silence is a real result. `breakdownReport` returns nothing when the fleet is too small or
 * the window too thin, and no notification is sent in that case — an alert saying "no
 * outliers" every month teaches people that this alert means nothing.
 */
export async function runBreakdownReport(
  ctx: SystemCtx,
  input: { today: string },
  policy: StoredMaintenancePolicy,
): Promise<OutlierReportResult> {
  const month = previousMonthStart(input.today)

  const outliers = await breakdownReport(
    ctx,
    { from: new Date(`${month}T00:00:00Z`), to: new Date(`${monthEnd(month)}T23:59:59Z`) },
    {
      // The rate is not needed for this report, and requiring one would make the outlier
      // report depend on a setting that has nothing to do with it.
      lineValuePerMinute: money('1', 'BDT'),
      minFleetTickets: policy.minFleetTickets,
      outlierMultiple: policy.outlierMultiple,
      outlierMinTickets: policy.outlierMinTickets,
    } satisfies MaintenancePolicy,
  )

  if (outliers.length === 0) return { month, outliers: 0, alerted: false }

  await notify(ctx, {
    role: 'maintenance',
    kind: 'maintenance.breakdown.outliers',
    severity: 'warning',
    titleKey: 'maintenance.notifications.breakdown_outliers.title',
    params: {
      month,
      machines: outliers.map((outlier) => ({
        machineId: outlier.machineId,
        tickets: outlier.tickets,
        timesMedian: outlier.timesMedian,
        fleetMedian: outlier.fleetMedian,
      })),
    },
    moduleId: 'maintenance',
    dedupeKey: `maintenance.outliers:${month}`,
  })

  return { month, outliers: outliers.length, alerted: true }
}

export interface DowntimeCostResult {
  month: string
  machines: number
  totalMinutes: number
  /** Set when no figure could be produced, with the reason. */
  skipped?: string
}

/**
 * Once a month: what machine stoppages cost.
 *
 * When no line-minute rate is configured this does NOT fall back to a default, and it does
 * not write zeroes. It notifies the owner that the figure could not be produced and says
 * why. A downtime cost of "0 BDT" for a month with four hours of stoppages is worse than an
 * absent one: it reads as an answer and closes the question, and nobody would go looking for
 * a setting they were never told was missing.
 */
export async function runDowntimeCosts(
  ctx: SystemCtx,
  input: { today: string },
  policy: StoredMaintenancePolicy,
): Promise<DowntimeCostResult> {
  const month = previousMonthStart(input.today)

  if (!policy.lineValuePerMinute) {
    await notify(ctx, {
      role: 'owner',
      kind: 'maintenance.downtime_cost.no_rate',
      severity: 'warning',
      titleKey: 'maintenance.notifications.downtime_no_rate.title',
      params: { month },
      moduleId: 'maintenance',
      href: '/settings/maintenance',
      dedupeKey: `maintenance.no_rate:${month}`,
    })

    return { month, machines: 0, totalMinutes: 0, skipped: 'no line-minute rate configured' }
  }

  const rate = money(policy.lineValuePerMinute.amount, policy.lineValuePerMinute.currency)

  const compiled = await compileMonthlyDowntimeCosts(
    ctx,
    { forMonth: month },
    {
      lineValuePerMinute: rate,
      minFleetTickets: policy.minFleetTickets,
      outlierMultiple: policy.outlierMultiple,
      outlierMinTickets: policy.outlierMinTickets,
    } satisfies MaintenancePolicy,
  )

  return { month, machines: compiled.machines, totalMinutes: compiled.totalMinutes }
}

export interface LowStockResult {
  parts: number
  alerted: number
}

/**
 * Spares at or below their reorder point.
 *
 * Keyed on the part and the shortfall, so a store that keeps dropping raises a new alert
 * each time it gets worse, and a store that sits at the same level does not raise one every
 * night.
 */
export async function runLowStockAlerts(ctx: SystemCtx): Promise<LowStockResult> {
  const low = await lowStock(ctx)
  let alerted = 0

  for (const part of low) {
    const created = await notify(ctx, {
      role: 'maintenance',
      kind: 'maintenance.parts.low',
      severity: part.onHand === 0 ? 'critical' : 'warning',
      titleKey: 'maintenance.notifications.parts_low.title',
      params: { name: part.name, onHand: part.onHand, minLevel: part.minLevel },
      moduleId: 'maintenance',
      entityTable: 'spare_parts',
      entityId: part.partId,
      dedupeKey: `parts.low:${part.partId}:${part.shortfall}`,
    })

    if (created) alerted += 1
  }

  return { parts: low.length, alerted }
}
