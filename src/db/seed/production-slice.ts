/**
 * 6.1 Line tracking seed slice — a shift as it actually reads at 3pm.
 *
 * The hourly board is the screen a factory looks at most, and it is only useful if the
 * numbers behave like a real shift rather than a flat line:
 *
 *  - **Hour 1 is always low.** A line that has just changed style does not hit target in
 *    its first hour, and a board where it does teaches supervisors to distrust the board.
 *  - **Line 4 is stopped.** An open downtime with no end time, 34 minutes and counting,
 *    which is what the canvas's "Line 4 stopped — 34 minutes" is showing. The hours around
 *    it are short by roughly what the stoppage cost.
 *  - **Line 6 is quietly behind all day.** No dramatic stoppage, just 85% of target hour
 *    after hour — the pattern that loses an order its date without ever raising an alarm.
 *
 * Endline counts carry a DHU that is plausible for a woven shirt line: a few defects per
 * hundred, not zero and not a crisis.
 */
import { and, eq } from 'drizzle-orm'

import { lines } from '@/modules/planning/schema'
import {
  dailyLinePlans,
  downtimes,
  endlineCounts,
  hourlyOutputs,
} from '@/modules/production/schema'
import { orders } from '@/modules/orders/schema'

import type { SeedContext, SeedSlice } from './types'

const today = () => new Date().toISOString().slice(0, 10)

/** Hours 8..16 — a normal day shift with two overtime hours at the end. */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16]

/**
 * Per line: the plan, and how the day actually ran.
 *
 * `factor` is achievement against target for a settled hour. `stoppedHour` is the hour a
 * line lost time in, and `stoppedFactor` what it managed during it.
 */
const LINE_DAY = [
  { code: 'L1', target: 120, manpower: 42, smv: '14.50', factor: 1.0, stoppedHour: null, stoppedFactor: 1 },
  { code: 'L2', target: 120, manpower: 42, smv: '14.50', factor: 0.97, stoppedHour: null, stoppedFactor: 1 },
  { code: 'L3', target: 110, manpower: 40, smv: '15.20', factor: 1.02, stoppedHour: null, stoppedFactor: 1 },
  // The stoppage the board is meant to surface.
  { code: 'L4', target: 125, manpower: 44, smv: '13.80', factor: 0.99, stoppedHour: 14, stoppedFactor: 0.43 },
  { code: 'L5', target: 110, manpower: 40, smv: '15.20', factor: 0.95, stoppedHour: null, stoppedFactor: 1 },
  // Behind all day, never alarmingly.
  { code: 'L6', target: 100, manpower: 38, smv: '16.10', factor: 0.85, stoppedHour: null, stoppedFactor: 1 },
] as const

/** The current hour of the shift — everything after it has not happened yet. */
const HOURS_ELAPSED = 7

/**
 * How the days before today ran, oldest first.
 *
 * The run-rate card averages a trailing window, so an order with only today's output has one
 * day of evidence and says so. These give it a real rate to project from.
 *
 * A Friday is left out entirely. It is the weekly holiday in Bangladesh, the floor does not
 * run, and the forecast has to count it as a zero — an order that needs 12,000 more pieces
 * does not care that the factory was closed, it still slips. Seeding a floor that runs seven
 * days a week would hide the exact case the zero-fill exists for.
 */
const PRIOR_DAYS = [{ back: 2, factor: 0.94 }, { back: 1, factor: 1.03 }] as const

const FRIDAY = 5

function dayBefore(day: string, back: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10)
}

export const PRODUCTION_SLICE: SeedSlice = {
  id: 'production',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const short = ctx.companyId.slice(0, 8)
    const counts: Record<string, number> = {}
    const day = today()

    const [order] = await ctx.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.companyId, ctx.companyId))
      .limit(1)
    if (!order) return counts

    const lineRows = await ctx.db
      .select({ id: lines.id, code: lines.code })
      .from(lines)
      .where(eq(lines.companyId, ctx.companyId))
    if (lineRows.length === 0) return counts

    const lineByCode = new Map(lineRows.map((l) => [l.code, l.id]))

    let plans = 0
    let hours = 0
    let stoppages = 0
    let counted = 0

    for (const spec of LINE_DAY) {
      const lineId = lineByCode.get(spec.code)
      if (!lineId) continue

      const existing = await ctx.db
        .select({ id: dailyLinePlans.id })
        .from(dailyLinePlans)
        .where(
          and(
            eq(dailyLinePlans.companyId, ctx.companyId),
            eq(dailyLinePlans.lineId, lineId),
            eq(dailyLinePlans.planDate, day),
          ),
        )
      if (existing.length > 0) continue

      await ctx.db.insert(dailyLinePlans).values({
        companyId: ctx.companyId,
        lineId,
        orderId: order.id,
        planDate: day,
        targetPerHour: spec.target,
        manpowerPlanned: spec.manpower,
        smv: spec.smv,
        createdBy: `seed-${short}-production`,
      })
      plans += 1

      let dayPassed = 0
      for (const [index, hour] of HOURS.entries()) {
        // Hours that have not happened are absent, not zero. A zero on the board reads as
        // "the line produced nothing", which is a very different thing from "not yet".
        if (index >= HOURS_ELAPSED) break

        const warmUp = index === 0 ? 0.72 : 1
        const factor = spec.stoppedHour === hour ? spec.stoppedFactor : spec.factor
        const actual = Math.round(spec.target * factor * warmUp)
        dayPassed += actual

        await ctx.db
          .insert(hourlyOutputs)
          .values({
            companyId: ctx.companyId,
            lineId,
            orderId: order.id,
            producedOn: day,
            hourSlot: hour,
            target: spec.target,
            actual,
            enteredBy: `seed-${short}-production`,
          })
          .onConflictDoNothing()
        hours += 1
      }

      if (spec.stoppedHour !== null) {
        // Open — no `endedAt`. The line is still down, which is what makes the board's
        // "stopped 34 minutes" count up rather than sit still.
        await ctx.db.insert(downtimes).values({
          companyId: ctx.companyId,
          lineId,
          startedAt: new Date(Date.now() - 34 * 60_000),
          reason: 'machine',
          note: 'Needle bar seized on the 4-thread overlock; mechanic called.',
          createdBy: `seed-${short}-production`,
        })
        stoppages += 1
      }

      // Endline QC for the day so far. Defects are per hundred checked, which is what DHU
      // means — a shirt line running 2–4 is normal, and zero would be a lie.
      const checked = Math.round(dayPassed * 0.94)
      const defective = Math.round(checked * 0.031)
      await ctx.db
        .insert(endlineCounts)
        .values({
          companyId: ctx.companyId,
          lineId,
          countedOn: day,
          checked,
          passed: checked - defective,
          defective,
          // A garment can carry more than one defect, so defects ≥ defective.
          defects: Math.round(defective * 1.25),
          rework: defective,
        })
        .onConflictDoNothing()
      counted += 1
    }

    // ── The days before today, so the run-rate card has a window to average ──────────
    for (const prior of PRIOR_DAYS) {
      const priorDay = dayBefore(day, prior.back)
      // Closed on Friday. The forecast counts it as a zero rather than skipping it.
      if (new Date(`${priorDay}T00:00:00Z`).getUTCDay() === FRIDAY) continue

      for (const spec of LINE_DAY) {
        const lineId = lineByCode.get(spec.code)
        if (!lineId) continue

        for (const hour of HOURS) {
          await ctx.db
            .insert(hourlyOutputs)
            .values({
              companyId: ctx.companyId,
              lineId,
              orderId: order.id,
              producedOn: priorDay,
              hourSlot: hour,
              target: spec.target,
              // A finished day, so every hour is settled — no warm-up hour, no stoppage.
              actual: Math.round(spec.target * spec.factor * prior.factor),
              enteredBy: `seed-${short}-production`,
            })
            .onConflictDoNothing()
          hours += 1
        }
      }
    }

    counts.daily_line_plans = plans
    counts.hourly_outputs = hours
    counts.downtimes = stoppages
    counts.endline_counts = counted
    return counts
  },
}
