/**
 * Production metrics (brief 6.1). Pure — no clock, no database.
 *
 * These three numbers are quoted every morning in a meeting where somebody is held
 * responsible for them, which is why the edge cases here refuse rather than guess:
 *
 *  - a line with nobody on it has no efficiency, not 0%;
 *  - nothing checked is not the same as nothing wrong;
 *  - a line that has not run cannot be forecast to "finish today".
 *
 * Each of those wrong answers is worse than a blank, because it is plausible.
 *
 * Arithmetic is scaled BigInt throughout. SMV is quoted to two decimals and a floor's
 * whole efficiency figure hangs off it.
 */

export class ProductionError extends Error {
  override readonly name = 'ProductionError'
}

const DECIMAL = /^\d+(\.\d+)?$/
const SCALE = 2

function toMinor(value: string | number, what: string): bigint {
  const text = String(value).trim()
  if (!DECIMAL.test(text)) throw new ProductionError(`"${value}" is not a positive decimal ${what}`)

  const [whole = '0', fraction = ''] = text.split('.')
  if (fraction.length > SCALE && /[1-9]/.test(fraction.slice(SCALE))) {
    throw new ProductionError(`"${value}" has more than ${SCALE} decimal places — round first`)
  }
  return BigInt(whole + fraction.padEnd(SCALE, '0').slice(0, SCALE))
}

const toDecimal = (minor: bigint): string => {
  const digits = minor.toString().padStart(SCALE + 1, '0')
  return `${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  return remainder * 2n >= denominator ? quotient + 1n : quotient
}

// ─────────────────────────────────────────────────────────────────────────────
// Efficiency
// ─────────────────────────────────────────────────────────────────────────────

export interface EfficiencyResult {
  earnedMinutes: string
  availableMinutes: string
  /** Can exceed 100 — see below. */
  efficiencyPct: string
}

/**
 * earned ÷ available, as a percentage.
 *
 * **Not capped at 100.** A line that beats its SMV is telling you the SMV is wrong, and
 * that is worth more than the flattering number a cap would show. Industrial engineering
 * re-times operations off exactly this signal.
 */
export function computeEfficiency(input: {
  /** Standard minute value per garment. */
  smv: string
  output: number
  manpower: number
  workingMinutes: number
}): EfficiencyResult {
  if (!Number.isInteger(input.output) || input.output < 0) {
    throw new ProductionError(`output must be a whole number of pieces, got ${input.output}`)
  }

  const available = BigInt(input.manpower) * BigInt(input.workingMinutes) * 100n
  if (available <= 0n) {
    // A line with nobody on it has no efficiency. Returning 0% would drag a factory
    // average down for a line that never ran, which is a different and worse lie.
    throw new ProductionError(
      'available minutes must be positive — a line with no manpower has no efficiency',
    )
  }

  const earned = toMinor(input.smv, 'SMV') * BigInt(input.output)

  return {
    earnedMinutes: toDecimal(earned),
    availableMinutes: toDecimal(available),
    efficiencyPct: toDecimal(divideRoundHalfUp(earned * 10_000n, available)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DHU
// ─────────────────────────────────────────────────────────────────────────────

export interface DhuResult {
  checked: number
  defects: number
  /** Defects per hundred units. Exceeds 100 when garments carry several defects each. */
  dhu: string
}

/**
 * Defects per hundred units.
 *
 * Counts DEFECTS, not defective garments — one garment can carry three. Conflating the
 * two understates a quality problem by exactly the amount that matters.
 */
export function computeDhu(input: { checked: number; defects: number }): DhuResult {
  if (!Number.isInteger(input.checked) || input.checked <= 0) {
    // Nothing checked is not the same as nothing wrong. A board showing 0.00 DHU for an
    // unchecked line is worse than a blank, because it looks like good news.
    throw new ProductionError('DHU needs a positive checked quantity')
  }
  if (!Number.isInteger(input.defects) || input.defects < 0) {
    throw new ProductionError(`defects must be a non-negative whole number, got ${input.defects}`)
  }

  const dhu = divideRoundHalfUp(BigInt(input.defects) * 100n * 100n, BigInt(input.checked))
  return { checked: input.checked, defects: input.defects, dhu: toDecimal(dhu) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run rate
// ─────────────────────────────────────────────────────────────────────────────

export interface TrailingDay {
  date: string
  output: number
}

export interface ForecastResult {
  ratePerDay: string
  daysNeeded: number | null
  forecastDate: string | null
  /** How much a milestone would be missed by. Zero when it would not. */
  slipDays: number
  atRisk: boolean
  /** `none` when the line has not run; `low` on a single day of data. */
  confidence: 'none' | 'low' | 'normal'
}

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function addDays(date: string, days: number): string {
  if (!ISO_DATE.test(date)) throw new ProductionError(`"${date}" is not a calendar date`)
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

const diffDays = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)

/**
 * When will this order finish, at the rate it has actually been running?
 *
 * The trailing window is the honest input: a line's plan says what it should do, the last
 * three days say what it does. Comparing the forecast against the TNA sewing milestone is
 * what turns that into an alert somebody can act on.
 */
export function forecastCompletion(input: {
  remainingQty: number
  trailing: readonly TrailingDay[]
  /** The day the forecast is made from — usually the last day with output. */
  fromDate: string
  /** TNA sewing-end milestone, when there is one to compare against. */
  milestoneDate?: string | null
}): ForecastResult {
  if (input.trailing.length === 0) {
    throw new ProductionError('a run-rate forecast needs at least one day of output')
  }
  if (!Number.isInteger(input.remainingQty) || input.remainingQty < 0) {
    throw new ProductionError(`remaining quantity must be a whole number, got ${input.remainingQty}`)
  }

  const total = input.trailing.reduce((sum, day) => sum + day.output, 0)
  const rateMinor = divideRoundHalfUp(BigInt(total) * 100n, BigInt(input.trailing.length))
  const confidence: ForecastResult['confidence'] =
    total === 0 ? 'none' : input.trailing.length < 2 ? 'low' : 'normal'

  if (total === 0) {
    // Rate zero. "Completes today" is the dangerous answer and Infinity is not an answer,
    // so the honest one is that there is no forecast.
    return {
      ratePerDay: toDecimal(rateMinor),
      daysNeeded: null,
      forecastDate: null,
      slipDays: 0,
      atRisk: Boolean(input.milestoneDate),
      confidence,
    }
  }

  // Ceiling: a part day is still a day on a shipping calendar.
  const daysNeeded = Number(
    (BigInt(input.remainingQty) * 100n + rateMinor - 1n) / rateMinor,
  )
  const forecastDate = addDays(input.fromDate, daysNeeded)

  const slipDays = input.milestoneDate
    ? Math.max(0, diffDays(input.milestoneDate, forecastDate))
    : 0

  return {
    ratePerDay: toDecimal(rateMinor),
    daysNeeded,
    forecastDate,
    slipDays,
    atRisk: slipDays > 0,
    confidence,
  }
}
