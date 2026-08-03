/**
 * Scheduled work for 7.1 (brief §Jobs).
 *
 * Two jobs, and they answer different questions. The day-close turns a day's inline checks
 * into one `dhu_daily` row per line, which is what the fourteen-day trend and every buyer
 * report read. The repeat-defect scan looks across days for the same defect at the same
 * operation — a pattern no single day's DHU can show, and the only quality signal that
 * reliably points at a fixable cause rather than a bad shift.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm'

import type { SystemCtx } from '../core/ctx'
import { notify } from '../core/notifications'
import { withTenantRead } from '../core/tenancy'

import { inlineChecks } from './schema'
import { closeDhuDay, repeatDefectAlerts, type QualityPolicy } from './service'

function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Close yesterday's DHU for every line that was checked.
 *
 * Only lines with checks. A line nobody inspected has no DHU — writing a zero would report a
 * perfect line, which is the opposite of what happened, and it is the number that would then
 * flatter a fourteen-day average and a buyer report alike.
 */
export async function runQualityDayClose(
  ctx: SystemCtx,
  input: { forDate?: string } = {},
  policy: QualityPolicy,
): Promise<{ forDate: string; lines: number; alerts: number }> {
  const forDate = input.forDate ?? daysBefore(new Date().toISOString().slice(0, 10), 1)

  const checked = await withTenantRead(ctx, (tx) =>
    tx
      .selectDistinct({ lineId: inlineChecks.lineId })
      .from(inlineChecks)
      .where(eq(inlineChecks.checkedOn, forDate)),
  )

  let alerts = 0
  for (const row of checked) {
    // `closeDhuDay` recomputes from source and upserts, so re-running a day is a no-op
    // rather than a double count — the same rule the production day-close follows.
    const result = await closeDhuDay(ctx, { lineId: row.lineId, date: forDate }, policy)
    if (result.alert) alerts += 1
  }

  return { forDate, lines: checked.length, alerts }
}

/**
 * The repeat-defect scan (canvas P5: "repeats worth a conversation").
 *
 * A run is the same defect code at the same operation on N consecutive days, where N comes
 * from the factory's policy. That shape is the point: one skipped stitch is a slip, the same
 * skipped stitch at the same buttonhole station three days running is a machine out of
 * adjustment or an operator who was never shown how — both fixable, neither visible in a
 * daily DHU that sits comfortably under target the whole time.
 */
export async function runRepeatDefectAlerts(
  ctx: SystemCtx,
  input: { today?: string } = {},
  policy: QualityPolicy,
): Promise<{ runs: number }> {
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  // A window twice the run length, so a run that started before the window still completes
  // inside it. Scanning exactly `repeatDefectDays` would only ever catch a run that began on
  // the first day of the window.
  const from = daysBefore(today, policy.repeatDefectDays * 2)

  const runs = await repeatDefectAlerts(ctx, { from, to: today }, policy)

  for (const run of runs) {
    await notify(ctx, {
      role: 'quality',
      kind: 'quality.defect.repeat',
      severity: 'warning',
      titleKey: 'quality.notifications.repeat_defect.title',
      params: { code: run.code, operation: run.operation, days: run.days, through: run.to },
      moduleId: 'quality',
      // The run's LAST day is in the key, so a run that keeps going raises a fresh alert
      // each day it extends — a repeat that nobody acted on is still worth saying — while
      // re-running the scan on the same day stays silent.
      dedupeKey: `quality.repeat:${run.code}:${run.operation}:${run.to}`,
    })
  }

  return { runs: runs.length }
}

/** Lines with at least one check in a window — the denominator a trend needs. */
export async function linesCheckedBetween(
  ctx: SystemCtx,
  input: { from: string; to: string },
): Promise<number> {
  const [row] = await withTenantRead(ctx, (tx) =>
    tx
      .select({ n: sql<string>`count(distinct ${inlineChecks.lineId})::text` })
      .from(inlineChecks)
      .where(and(gte(inlineChecks.checkedOn, input.from), lte(inlineChecks.checkedOn, input.to))),
  )
  return Number(row?.n ?? 0)
}
