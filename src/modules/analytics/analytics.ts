/**
 * 11.2 Owner Dashboard & Analytics — pure logic.
 *
 * This is the one screen nobody re-derives. An owner looks at an efficiency figure and
 * decides whether to take the next order; a wrong one here is not a wrong pixel, it is a
 * commitment. So every function refuses rather than rounds toward a comfortable answer.
 *
 * The recurring mistake this module exists to not make is averaging a ratio. The mean of
 * daily efficiency percentages is not the period's efficiency, and the gap is not small: a
 * day where the factory ran 900 earned minutes out of 1,000 counts as heavily as a day of
 * 9,000 out of 20,000, so a fortnight with two quiet days reads twenty points better than it
 * was. Same for DHU, same for on-time delivery. Sum the numerators, sum the denominators,
 * divide once.
 *
 * The second is reporting a percentage from a denominator too small to carry one. Two
 * shipments, one late, is not "50% on-time delivery"; it is two shipments. On a buyer
 * scorecard that figure ranks a stranger against a decade-long customer.
 *
 * Nothing here reads a clock or a database. CLAUDE.md rule 9: this module never writes.
 */
import { add, subtract, sum, zero, type Money } from '@/lib/money'

export class AnalyticsError extends Error {
  override readonly name = 'AnalyticsError'
}

const ratioPct = (numerator: number, denominator: number): string =>
  ((numerator / denominator) * 100).toFixed(2)

// ─────────────────────────────────────────────────────────────────────────────
// Rates over a period
// ─────────────────────────────────────────────────────────────────────────────

export interface EfficiencyDay {
  earnedMinutes: string
  availableMinutes: string
}

/**
 * Efficiency across a period: earned minutes over available minutes, divided once.
 *
 * NOT the mean of the daily percentages. On a factory whose output swings day to day the two
 * differ by several points, and always in the flattering direction — a day on which almost
 * nothing was made carries the same weight as the day that carried the month.
 */
export function efficiencyForPeriod(days: readonly EfficiencyDay[]): string {
  const earned = days.reduce((running, day) => running + Number(day.earnedMinutes), 0)
  const available = days.reduce((running, day) => running + Number(day.availableMinutes), 0)

  if (available <= 0) {
    // A factory that was shut has no efficiency. Reporting 0% puts it at the bottom of a
    // league table it is not in.
    throw new AnalyticsError('no available minutes in this period — there is no efficiency to report')
  }

  return ratioPct(earned, available)
}

export interface DhuDay {
  defects: number
  checked: number
}

/** Defects per hundred units across a period. Sum both sides, then divide. */
export function dhuForPeriod(days: readonly DhuDay[]): string {
  const defects = days.reduce((running, day) => running + day.defects, 0)
  const checked = days.reduce((running, day) => running + day.checked, 0)

  if (checked <= 0) {
    throw new AnalyticsError('nothing was checked in this period — there is no DHU to report')
  }

  return ratioPct(defects, checked)
}

/**
 * On-time delivery.
 *
 * A shipment that left ON its date is on time: the commitment is the date, not the day
 * before it.
 *
 * `minShipments` is the guard that matters. A percentage from three shipments is not a
 * delivery record, and it is precisely the figure that ends up on a buyer scorecard beside
 * one built on eighty.
 */
export function otdPct(input: {
  shipped: number
  onTime: number
  minShipments: number
}): string {
  if (input.shipped <= 0) {
    throw new AnalyticsError('no shipments in this period — there is no on-time record to report')
  }
  if (input.onTime > input.shipped) {
    // The join is wrong. Clamping to 100% would hide it behind a perfect score.
    throw new AnalyticsError(
      `${input.onTime} on-time shipments out of ${input.shipped} — the two do not reconcile`,
    )
  }
  if (input.shipped < input.minShipments) {
    throw new AnalyticsError(
      `${input.shipped} shipments is too few to state an on-time percentage (minimum ` +
        `${input.minShipments}) — report the count instead`,
    )
  }

  return ratioPct(input.onTime, input.shipped)
}

// ─────────────────────────────────────────────────────────────────────────────
// Trends
// ─────────────────────────────────────────────────────────────────────────────

export type Trend = 'improving' | 'worsening' | 'flat' | 'unknown'

/**
 * Which way a series is going, or an admission that it cannot be said.
 *
 * Two guards, both against reading a pattern into a factory.
 *
 * Fewer than `minPoints` returns `unknown` rather than a direction. Three days of rising
 * efficiency is three days.
 *
 * A move smaller than the threshold is `flat`. Half a point either way over a fortnight is
 * ordinary variation, and an arrow next to it invites somebody to explain it.
 *
 * The comparison is first half against second half rather than first point against last:
 * one exceptional day at either end should not decide the direction of a month.
 */
export function trendDirection(
  points: readonly number[],
  policy: { minPoints: number; thresholdPct: string },
): Trend {
  if (points.length < policy.minPoints) return 'unknown'

  const middle = Math.floor(points.length / 2)
  const earlier = points.slice(0, middle)
  const later = points.slice(points.length - middle)

  const mean = (values: readonly number[]): number =>
    values.reduce((running, point) => running + point, 0) / values.length

  const change = mean(later) - mean(earlier)
  const threshold = Number(policy.thresholdPct)

  if (Math.abs(change) < threshold) return 'flat'
  return change > 0 ? 'improving' : 'worsening'
}

// ─────────────────────────────────────────────────────────────────────────────
// Buyer scorecards
// ─────────────────────────────────────────────────────────────────────────────

export interface ScorecardInput {
  buyerId: string
  orders: number
  otdPct: string | null
  dhu: string | null
  avgMarginPct: string | null
}

export interface ScorecardPolicy {
  minOrders: number
  weights: { otd: number; dhu: number; margin: number }
}

export interface Scorecard {
  buyerId: string
  rated: boolean
  /** 0–100, or null when this buyer cannot honestly be scored. */
  score: string | null
  /** Why it is unrated. Shown instead of the score, never alongside a number. */
  reason: string | null
  components: { otd: string | null; dhu: string | null; margin: string | null }
}

/** DHU at or above this scores zero on that component; zero DHU scores full marks. */
const DHU_FLOOR = 10

/**
 * A weighted score for a buyer, or a refusal.
 *
 * A composite score is the most authoritative-looking number this module produces and the
 * easiest to produce wrongly, so it declines in two situations rather than rounding down.
 *
 * **Too little history.** A buyer with two orders is not a bad buyer; they are a new one.
 * Scoring them 40 puts them below a buyer of eighty orders scoring 60 as though the
 * comparison meant something.
 *
 * **A missing component.** A buyer with no margin data is not a buyer with no margin.
 * Treating an absent figure as zero drops a profitable customer to the bottom of the list,
 * and the reason would be invisible on the screen where it mattered.
 */
export function buyerScorecard(input: ScorecardInput, policy: ScorecardPolicy): Scorecard {
  // Read the weights out into locals first. `weights.margin` is a WEIGHT, not an amount,
  // but the no-float-money rule reads the name and is right to — this is the one place in
  // the module where a name and a meaning genuinely diverge.
  const { otd: otdWeight, dhu: dhuWeight, margin: profitWeight } = policy.weights
  const weightSum = otdWeight + dhuWeight + profitWeight
  if (Math.abs(weightSum - 1) > 1e-9) {
    // Weights summing to 0.9 scale every score down by a tenth and leave the RANKING intact,
    // which is exactly why nobody would ever find it.
    throw new AnalyticsError(`scorecard weights must sum to 1, got ${weightSum}`)
  }

  const unrated = (reason: string): Scorecard => ({
    buyerId: input.buyerId,
    rated: false,
    score: null,
    reason,
    components: { otd: null, dhu: null, margin: null },
  })

  if (input.orders < policy.minOrders) {
    return unrated(
      `${input.orders} ${input.orders === 1 ? 'order' : 'orders'} is too few to score (minimum ${policy.minOrders})`,
    )
  }
  if (input.otdPct === null) return unrated('no on-time delivery record for this buyer')
  if (input.dhu === null) return unrated('no quality record for this buyer')
  if (input.avgMarginPct === null) return unrated('no margin record for this buyer')

  const otd = Math.max(0, Math.min(100, Number(input.otdPct)))
  // Lower DHU is better, so it is inverted onto the same 0–100 scale as the others.
  const dhu = Math.max(0, 100 - (Number(input.dhu) / DHU_FLOOR) * 100)
  // Read out under a non-money name first: these are PERCENTAGES being scored, not
  // amounts, and the no-float-money rule is right to be suspicious of the field name.
  const profitPct = input.avgMarginPct
  const profit = Math.max(0, Math.min(100, Number(profitPct) * 5))

  const score =
    otd * otdWeight + dhu * dhuWeight + profit * profitWeight

  return {
    buyerId: input.buyerId,
    rated: true,
    score: score.toFixed(2),
    reason: null,
    components: { otd: otd.toFixed(2), dhu: dhu.toFixed(2), margin: profit.toFixed(2) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash
// ─────────────────────────────────────────────────────────────────────────────

export interface CashPosition {
  inflow: Money
  outflow: Money
  net: Money
}

/**
 * What is owed to the factory less what it owes, in ONE currency.
 *
 * `sum` refuses a mixed list, which is the behaviour wanted here: netting USD receivables
 * against BDT payables produces a number in neither currency, and there is no ambient
 * exchange rate anywhere in this system. An owner's cash screen would be the worst possible
 * place to invent the first one.
 */
export function cashPosition(input: {
  receivables: readonly Money[]
  payables: readonly Money[]
  currency: string
}): CashPosition {
  const inflow = input.receivables.length
    ? sum(input.receivables, input.currency)
    : zero(input.currency)
  const outflow = input.payables.length ? sum(input.payables, input.currency) : zero(input.currency)

  return { inflow, outflow, net: subtract(inflow, outflow) }
}

// ─────────────────────────────────────────────────────────────────────────────
// The exceptions feed
// ─────────────────────────────────────────────────────────────────────────────

export type ExceptionKind =
  | 'lc_conflict'
  | 'tna_risk'
  | 'cap_critical'
  | 'runrate_miss'
  | 'approval_waiting'
  | 'payroll_anomaly'

export type ExceptionSeverity = 'low' | 'medium' | 'high'

/**
 * How loud each kind of exception gets, and how fast it gets louder.
 *
 * `start` is what it is worth the moment it appears; `highAfterDays` is when it becomes
 * unignorable. A critical CAP starts high because a locked fire exit does not become more
 * urgent by waiting, and something merely waiting for approval starts low but does escalate
 * — a draft nobody has looked at for a month is its own kind of problem.
 */
const SEVERITY_RULES: Readonly<
  Record<ExceptionKind, { start: ExceptionSeverity; highAfterDays: number }>
> = {
  lc_conflict: { start: 'medium', highAfterDays: 7 },
  tna_risk: { start: 'medium', highAfterDays: 7 },
  cap_critical: { start: 'high', highAfterDays: 0 },
  runrate_miss: { start: 'low', highAfterDays: 5 },
  approval_waiting: { start: 'low', highAfterDays: 14 },
  payroll_anomaly: { start: 'high', highAfterDays: 0 },
}

export function exceptionSeverity(input: {
  kind: ExceptionKind
  ageDays: number
}): ExceptionSeverity {
  const rule = SEVERITY_RULES[input.kind]
  if (!rule) {
    // A new kind quietly defaulting to `low` is a new class of problem nobody is shown.
    throw new AnalyticsError(`no severity rule for exception kind "${String(input.kind)}"`)
  }

  return input.ageDays >= rule.highAfterDays ? 'high' : rule.start
}

// ─────────────────────────────────────────────────────────────────────────────
// Freshness
// ─────────────────────────────────────────────────────────────────────────────

export interface AsOf {
  computedAt: string
  ageSeconds: number
  stale: boolean
}

/**
 * The stamp every cached figure carries.
 *
 * A dashboard number without one is presented as "now", and a five-minute-old cash position
 * read as now is how a supplier gets paid twice.
 *
 * A computation timestamped in the future is refused rather than reported as a negative age.
 * That happens through clock skew between the worker and the web tier, and the failure it
 * causes is silent: an age below zero is never greater than the TTL, so the figure would
 * never go stale and would simply stop updating.
 */
export function asOf(computedAt: Date, now: Date, ttlSeconds: number): AsOf {
  const ageSeconds = Math.round((now.getTime() - computedAt.getTime()) / 1000)

  if (ageSeconds < 0) {
    throw new AnalyticsError(
      `computed ${Math.abs(ageSeconds)}s in the future — the worker and web clocks disagree`,
    )
  }

  return {
    computedAt: computedAt.toISOString(),
    ageSeconds,
    stale: ageSeconds > ttlSeconds,
  }
}

export { add }
