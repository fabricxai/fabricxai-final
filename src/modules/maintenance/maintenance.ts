/**
 * 9.1 Machines & Tickets — pure logic.
 *
 * A maintenance module produces two kinds of number that people act on without checking:
 * a taka figure for a stopped line, and a list of machines said to be breaking down more
 * than they should. Both are easy to generate and easy to get wrong in a way nobody
 * notices, so both refuse rather than guess.
 *
 *  - `estimatedDowntimeLoss` will not price a stoppage without a rate. A confident "0 BDT"
 *    beside a four-hour line stop reads as an answer and closes the question.
 *  - `breakdownOutliers` compares against the MEDIAN and demands a real sample. Mean-plus-
 *    two-sigma is worse than useless on a small fleet: a single bad machine inflates the
 *    standard deviation until it no longer looks unusual, and with five machines nothing
 *    can ever exceed 1.79σ at all.
 *  - `nextPmDue` clamps month arithmetic to the end of the month, so a service scheduled on
 *    the 31st does not walk forward a few days every month until it happens at the wrong time.
 *
 * Nothing here reads a clock or a database.
 */
import { isNegative, isZero, money, multiply, type Money } from '@/lib/money'

export class MaintenanceError extends Error {
  override readonly name = 'MaintenanceError'
}

const MS_PER_DAY = 86_400_000

export type Cadence = 'daily' | 'weekly' | 'monthly'

const CADENCE_DAYS: Readonly<Record<'daily' | 'weekly', number>> = { daily: 1, weekly: 7 }

const parseDate = (value: string, what: string): Date => {
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) throw new MaintenanceError(`${what} is not a date: ${value}`)
  return parsed
}

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * One calendar month on, clamped to the end of the target month.
 *
 * 31 January becomes 28 February, not 3 March. Left unclamped, a machine serviced on the
 * 31st is next due on the 3rd, then the 3rd of the month after, and within a year its
 * service has drifted a week from where the schedule intended.
 */
function addMonthClamped(from: Date): Date {
  const year = from.getUTCFullYear()
  const month = from.getUTCMonth()
  const day = from.getUTCDate()

  // Day 0 of the month after next is the last day of next month.
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate()
  return new Date(Date.UTC(year, month + 1, Math.min(day, lastDayOfNextMonth)))
}

/**
 * When a machine's next preventive service falls due.
 *
 * A machine that has NEVER been serviced is due today. Counting a cadence forward from
 * nothing would hand a newly-registered machine a month of grace it did not earn, and the
 * machines most likely to have no PM record are exactly the ones nobody is looking after.
 */
export function nextPmDue(input: {
  lastCompletedOn: string | null
  cadence: Cadence
  today?: string
}): string {
  if (input.lastCompletedOn === null) {
    if (!input.today) throw new MaintenanceError('a never-serviced machine needs today’s date')
    return input.today
  }

  const last = parseDate(input.lastCompletedOn, 'lastCompletedOn')

  if (input.cadence === 'monthly') return toIsoDate(addMonthClamped(last))

  const days = CADENCE_DAYS[input.cadence as 'daily' | 'weekly']
  if (!days) throw new MaintenanceError(`unknown cadence: ${String(input.cadence)}`)

  return toIsoDate(new Date(last.getTime() + days * MS_PER_DAY))
}

export interface PmScheduleRow {
  scheduleId: string
  machineId: string
  cadence: Cadence
  lastCompletedOn: string | null
}

export interface PmDue {
  scheduleId: string
  machineId: string
  dueOn: string
  /** Zero on the day it falls due. Never negative — those are not on the list. */
  daysOverdue: number
  /** No PM has ever been recorded for this machine. */
  neverServiced: boolean
}

/** What is due today or should already have happened, worst first. */
export function pmDueList(schedules: readonly PmScheduleRow[], today: string): PmDue[] {
  const now = parseDate(today, 'today')

  return schedules
    .map((schedule) => {
      const dueOn = nextPmDue({
        lastCompletedOn: schedule.lastCompletedOn,
        cadence: schedule.cadence,
        today,
      })
      return {
        scheduleId: schedule.scheduleId,
        machineId: schedule.machineId,
        dueOn,
        daysOverdue: Math.round((now.getTime() - parseDate(dueOn, 'dueOn').getTime()) / MS_PER_DAY),
        neverServiced: schedule.lastCompletedOn === null,
      }
    })
    .filter((due) => due.daysOverdue >= 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.machineId.localeCompare(b.machineId))
}

/**
 * What a stoppage cost, in taka.
 *
 * `valuePerMinute` is what one minute of that line earns — it comes from the line's own
 * standard-minute value and is passed in, never assumed here. Refusing a zero rate is the
 * point of the function: this number gets quoted in a monthly report, and a stoppage priced
 * at nothing because nobody configured a rate is indistinguishable from a stoppage that
 * genuinely cost nothing.
 */
export function estimatedDowntimeLoss(input: { minutes: number; valuePerMinute: Money }): Money {
  if (!Number.isFinite(input.minutes) || input.minutes < 0) {
    throw new MaintenanceError(`downtime minutes must be zero or more, got ${input.minutes}`)
  }
  if (isZero(input.valuePerMinute) || isNegative(input.valuePerMinute)) {
    throw new MaintenanceError(
      'cannot price a stoppage without a per-minute value for the line — configure one rather ' +
        'than reporting a loss of zero',
    )
  }

  return multiply(input.valuePerMinute, input.minutes)
}

/**
 * How much of its available time a machine actually ran.
 *
 * Both refusals matter more than the arithmetic. Running longer than the line was open
 * means the downtime record or the line calendar is wrong, and clamping to 100% hides it.
 * A machine on a line that never opened has no utilization at all; reporting 0% would put
 * it at the top of a worst-utilized list it does not belong on.
 */
export function utilizationPct(input: { runMinutes: number; availableMinutes: number }): string {
  if (input.availableMinutes <= 0) {
    throw new MaintenanceError('no available minutes — this machine has no utilization to report')
  }
  if (input.runMinutes < 0 || input.runMinutes > input.availableMinutes) {
    throw new MaintenanceError(
      `ran ${input.runMinutes} of ${input.availableMinutes} available minutes — the downtime ` +
        'record or the line calendar is wrong',
    )
  }

  return ((input.runMinutes / input.availableMinutes) * 100).toFixed(2)
}

export interface BreakdownRow {
  machineId: string
  tickets: number
}

export interface BreakdownOutlier {
  machineId: string
  tickets: number
  fleetMedian: number
  /** How many times the typical machine's count this is. Null when the median is zero. */
  timesMedian: string | null
}

export interface OutlierPolicy {
  /** Tickets across the whole fleet before the comparison means anything. */
  minFleetTickets: number
  /** Times the median a machine must reach. */
  multiple: number
  /** Absolute floor, which is what decides when the median is zero. */
  minTickets: number
}

/** The fleet is compared against at least this many machines, or not at all. */
const MIN_FLEET_SIZE = 3

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

/**
 * Machines breaking down far more than the typical one.
 *
 * Two gates before any comparison happens, and both exist because this report sends a
 * mechanic to strip a machine:
 *
 *  - fewer than three machines is not a fleet. Whichever of two broke down more is simply
 *    the one that broke down more.
 *  - a handful of tickets across the whole fleet is not a pattern. Ordinary variation in a
 *    thin window looks exactly like a signal.
 *
 * The median, not the mean, and a ratio rather than a z-score. One machine failing twenty
 * times drags the mean toward itself and inflates the standard deviation with it, so the
 * very machine the report exists to find stops looking unusual. It also gives a maintenance
 * manager a sentence they can act on: this one broke down six times as often as normal.
 */
export function breakdownOutliers(
  rows: readonly BreakdownRow[],
  policy: OutlierPolicy,
): BreakdownOutlier[] {
  if (rows.length < MIN_FLEET_SIZE) return []

  const fleetTickets = rows.reduce((running, row) => running + row.tickets, 0)
  if (fleetTickets < policy.minFleetTickets) return []

  const fleetMedian = medianOf(rows.map((row) => row.tickets))
  const threshold = Math.max(fleetMedian * policy.multiple, policy.minTickets)

  return rows
    .filter((row) => row.tickets >= threshold && row.tickets > fleetMedian)
    .map((row) => ({
      machineId: row.machineId,
      tickets: row.tickets,
      fleetMedian,
      // A ratio against zero is undefined, and printing "Infinity×" helps nobody. The
      // absolute floor is what flagged these, and that is what the caller should say.
      timesMedian: fleetMedian > 0 ? (row.tickets / fleetMedian).toFixed(1) : null,
    }))
    .sort((a, b) => b.tickets - a.tickets || a.machineId.localeCompare(b.machineId))
}

export interface SparePartRow {
  partId: string
  name: string
  onHand: number
  minLevel: number
}

export interface ReorderLine extends SparePartRow {
  /** How many below the minimum. Zero when sitting exactly on it. */
  shortfall: number
}

/**
 * Spares at or below their minimum level.
 *
 * At the minimum counts: a minimum level is a reorder point, not a comfortable position, and
 * a store that waits to go below it is a store that runs out during the lead time.
 */
export function reorderList(parts: readonly SparePartRow[]): ReorderLine[] {
  return parts
    .map((part) => {
      if (part.onHand < 0) {
        // Negative stock is a counting error, not a very large shortfall. Ordering against
        // it would order the wrong quantity and bury the real problem.
        throw new MaintenanceError(`${part.name} shows ${part.onHand} on hand — stock cannot be negative`)
      }
      return { ...part, shortfall: Math.max(0, part.minLevel - part.onHand) }
    })
    .filter((part) => part.onHand <= part.minLevel)
    .sort((a, b) => b.shortfall - a.shortfall || a.partId.localeCompare(b.partId))
}

/** Re-exported so callers can build a Money without importing two modules. */
export { money }
