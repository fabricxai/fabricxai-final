/**
 * Capacity arithmetic (brief 4.1 §Operations). Pure — no database, no clock.
 *
 * Answers the question an owner asks on the phone: "can we take 40,000 pieces for
 * August?" Wrong in either direction is expensive — say no and the order goes elsewhere,
 * say yes and the factory misses a date it has already committed to.
 *
 * **Violations are reported, never clamped.** The brief says so explicitly and it is the
 * whole design: a planner 1,700 minutes over needs to see 1,700, not a plan quietly
 * trimmed to fit. Software that silently makes the numbers work is software that gets
 * overruled by a spreadsheet within a month.
 *
 * Every answer carries its assumptions. A capacity figure without the efficiency it
 * assumed is a number somebody will quote back six weeks later as a promise.
 */
import { multiplyDecimalStrings, roundToScale } from '@/lib/quantity'

import { defineStateMachine } from '../core/state-machine'

export class PlanningError extends Error {
  override readonly name = 'PlanningError'
}

const DECIMAL = /^\d+(\.\d+)?$/

export interface LineDayCapacity {
  lineId: string
  date: string
  shiftMinutes: number
  plannedDowntimeMinutes: number
  manpower: number
  /** What this line is expected to run at. Overridden per day by a learning curve. */
  expectedEfficiencyPct: string
}

export interface PlannedLoad {
  orderId: string
  styleCode: string
  /** Standard minutes per garment. */
  smv: string
  qty: number
}

export interface PlanningViolation {
  code: string
  /** i18n key — never a display string. */
  messageKey: string
  facts: Record<string, string | number>
}

export interface LineDayLoadResult {
  lineId: string
  date: string
  availableMinutes: string
  earnableMinutes: string
  requiredMinutes: string
  /** Positive when the plan fits. */
  slackMinutes: string
  /** Positive when it does not. Never zeroed out to make a plan look feasible. */
  overloadMinutes: string
  fits: boolean
  violations: PlanningViolation[]
}

/** More styles than this on one line in one day is a plan that will not happen. */
const CHANGEOVER_WARN_THRESHOLD = 3

function assertPositiveInt(value: number, what: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PlanningError(`${what} must be a positive whole number, got ${value}`)
  }
  return value
}

function assertDecimal(value: string, what: string): string {
  if (!DECIMAL.test(value)) throw new PlanningError(`"${value}" is not a decimal ${what}`)
  return value
}

/**
 * What a line-day can actually earn.
 *
 * `available` is clock time × people; `earnable` applies the efficiency the line is
 * expected to run at. Planning against available minutes rather than earnable ones is the
 * single most common way a factory over-commits — it assumes 100% efficiency, which no
 * sewing line has ever achieved.
 */
export function effectiveMinutes(capacity: LineDayCapacity): {
  availableMinutes: string
  earnableMinutes: string
} {
  assertPositiveInt(capacity.shiftMinutes, 'shift minutes')
  assertPositiveInt(capacity.manpower, 'manpower')

  if (capacity.plannedDowntimeMinutes < 0) {
    throw new PlanningError('planned downtime cannot be negative')
  }
  if (capacity.plannedDowntimeMinutes >= capacity.shiftMinutes) {
    throw new PlanningError(
      `planned downtime (${capacity.plannedDowntimeMinutes}) is not less than the shift (${capacity.shiftMinutes})`,
    )
  }

  // Downtime costs every operator on the line, not one minute.
  const workingMinutes = capacity.shiftMinutes - capacity.plannedDowntimeMinutes
  const available = String(workingMinutes * capacity.manpower)

  const earnable = multiplyDecimalStrings(
    available,
    divideBy100(assertDecimal(capacity.expectedEfficiencyPct, 'efficiency')),
  )

  return {
    availableMinutes: roundToScale(available),
    earnableMinutes: roundToScale(earnable),
  }
}

/** `60` → `0.60`, exactly. */
function divideBy100(pct: string): string {
  const [whole = '0', fraction = ''] = pct.split('.')
  const digits = (whole + fraction).padStart(fraction.length + 3, '0')
  const scale = fraction.length + 2
  return `${digits.slice(0, -scale) || '0'}.${digits.slice(-scale)}`
}

export interface LearningCurvePoint {
  dayIndex: number
  efficiencyPct: string
}

/**
 * What efficiency to plan a style at on a given day of its run.
 *
 * A new style does not start at its steady-state rate: operators learn the operation,
 * and day one is often half of day ten. Planning at the steady state is how a factory
 * promises a ship date it misses in the first week.
 *
 * Beyond the last studied point the curve HOLDS rather than extrapolating. Extrapolation
 * would keep climbing, and a guess that always flatters the plan is worse than none.
 */
export function efficiencyForDay(
  curve: readonly LearningCurvePoint[],
  dayIndex: number,
  fallbackPct?: string,
): string {
  assertPositiveInt(dayIndex, 'day index')

  if (curve.length === 0) {
    if (!fallbackPct) {
      throw new PlanningError(
        'no learning curve and no default efficiency — refusing to guess a rate',
      )
    }
    return assertDecimal(fallbackPct, 'efficiency')
  }

  const sorted = [...curve].sort((a, b) => a.dayIndex - b.dayIndex)
  let chosen = sorted[0]!

  for (const point of sorted) {
    if (point.dayIndex <= dayIndex) chosen = point
    else break
  }

  return chosen.efficiencyPct
}

/**
 * Does this line-day's plan fit?
 *
 * Returns the numbers and any violations. It does not adjust the plan — see the file
 * header.
 */
export function checkLineDayLoad(
  capacity: LineDayCapacity,
  loads: readonly PlannedLoad[],
): LineDayLoadResult {
  const { availableMinutes, earnableMinutes } = effectiveMinutes(capacity)

  let required = '0'
  for (const load of loads) {
    assertPositiveInt(load.qty, `quantity for order ${load.orderId}`)
    assertDecimal(load.smv, 'SMV')
    required = addDecimals(required, multiplyDecimalStrings(load.smv, String(load.qty)))
  }

  const requiredMinutes = roundToScale(required)
  const difference = subtractDecimals(earnableMinutes, requiredMinutes)
  const fits = !difference.startsWith('-')

  const violations: PlanningViolation[] = []

  if (!fits) {
    violations.push({
      code: 'line_day_overloaded',
      messageKey: 'planning.violations.line_day_overloaded',
      facts: {
        lineId: capacity.lineId,
        date: capacity.date,
        requiredMinutes,
        earnableMinutes,
        overloadMinutes: difference.slice(1),
      },
    })
  }

  // Every style change costs setup the SMV does not include.
  const styles = new Set(loads.map((load) => load.styleCode))
  if (styles.size >= CHANGEOVER_WARN_THRESHOLD) {
    violations.push({
      code: 'changeover_density',
      messageKey: 'planning.violations.changeover_density',
      facts: { lineId: capacity.lineId, date: capacity.date, styles: styles.size },
    })
  }

  return {
    lineId: capacity.lineId,
    date: capacity.date,
    availableMinutes,
    earnableMinutes,
    requiredMinutes,
    slackMinutes: fits ? difference : '0.00',
    overloadMinutes: fits ? '0.00' : difference.slice(1),
    fits,
    violations,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The owner card
// ─────────────────────────────────────────────────────────────────────────────

export interface CapacityAnswer {
  feasible: boolean
  requiredMinutes: string
  /** Earnable minutes left across the window after existing commitments. */
  availableMinutes: string
  shortfallMinutes: string
  /** Roughly how many more line-days would close the gap. */
  additionalLineDaysNeeded: number
  /** An answer without these is a number somebody quotes back as a promise. */
  assumptions: {
    smv: string
    efficiencyPct: string
    lineDays: number
    countsExistingLoad: boolean
  }
}

/**
 * "Can we take this order in this window?" — pure and cacheable, per the brief.
 *
 * Subtracts what is already committed on those days. A feasibility answer that ignores
 * existing allocations is arithmetic, not planning.
 */
export function answerCapacityQuery(input: {
  smv: string
  qty: number
  lineDays: readonly LineDayCapacity[]
  existingLoad: readonly { lineId: string; date: string; loads: readonly PlannedLoad[] }[]
}): CapacityAnswer {
  if (input.lineDays.length === 0) {
    throw new PlanningError('no line-days in the window — nothing to answer against')
  }
  assertPositiveInt(input.qty, 'quantity')

  if (!input.smv || !DECIMAL.test(input.smv)) {
    // "About twelve minutes" is how a factory commits to a date it cannot make.
    throw new PlanningError('a capacity answer needs a real SMV — refusing to estimate one')
  }

  const committed = new Map<string, PlannedLoad[]>()
  for (const entry of input.existingLoad) {
    committed.set(`${entry.lineId}:${entry.date}`, [...entry.loads])
  }

  let free = '0'
  for (const day of input.lineDays) {
    const existing = committed.get(`${day.lineId}:${day.date}`) ?? []
    const result = checkLineDayLoad(day, existing)
    // Only positive slack counts. An already-overloaded day does not lend capacity to
    // the next one, and letting it net off would hide the overload entirely.
    if (result.fits) free = addDecimals(free, result.slackMinutes)
  }

  const requiredMinutes = roundToScale(multiplyDecimalStrings(input.smv, String(input.qty)))
  const availableMinutes = roundToScale(free)
  const difference = subtractDecimals(availableMinutes, requiredMinutes)
  const feasible = !difference.startsWith('-')

  const shortfall = feasible ? '0.00' : difference.slice(1)
  // Ceiling division on scale-2 BigInt minutes — same maths as ceil(shortfall / perDay),
  // but a 15-digit shortfall cannot land on the wrong side of a day boundary.
  const perDayMinor = toMinorMinutes(effectiveMinutes(input.lineDays[0]!).earnableMinutes)

  return {
    feasible,
    requiredMinutes,
    availableMinutes,
    shortfallMinutes: shortfall,
    additionalLineDaysNeeded: feasible
      ? 0
      : perDayMinor > 0n
        ? Number((toMinorMinutes(shortfall) + perDayMinor - 1n) / perDayMinor)
        : // A line-day that earns zero minutes never closes a shortfall — same answer the
          // float division gave (ceil of Infinity), spelled honestly.
          Number.POSITIVE_INFINITY,
    assumptions: {
      smv: input.smv,
      efficiencyPct: input.lineDays[0]!.expectedEfficiencyPct,
      lineDays: input.lineDays.length,
      countsExistingLoad: input.existingLoad.length > 0,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exact decimal helpers — minutes are numeric(12,2) and never a float
// ─────────────────────────────────────────────────────────────────────────────

function toMinorMinutes(value: string): bigint {
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
  const minor = BigInt(whole + fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -minor : minor
}

function fromMinorMinutes(minor: bigint): string {
  const negative = minor < 0n
  const digits = (negative ? -minor : minor).toString().padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

const addDecimals = (a: string, b: string): string =>
  fromMinorMinutes(toMinorMinutes(a) + toMinorMinutes(b))

const subtractDecimals = (a: string, b: string): string =>
  fromMinorMinutes(toMinorMinutes(a) - toMinorMinutes(b))


// ─────────────────────────────────────────────────────────────────────────────
// Status machines
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Here rather than in `service.ts`, and the reason is the planning board's own buttons.
 *
 * A screen that offers a move the server would refuse teaches people to distrust it, so the
 * client reads the same transition table the server enforces — and a client component
 * importing `service.ts` pulls in the database client, and with it `postgres`, which the
 * browser cannot bundle. This file is pure, so both sides can read it.
 */
export const allocationMachine = defineStateMachine({
  field: 'status',
  initial: 'planned',
  transitions: {
    planned: ['active'],
    active: ['done'],
    done: [],
  },
})

export const scenarioMachine = defineStateMachine({
  field: 'status',
  initial: 'draft',
  transitions: {
    draft: ['applied', 'discarded'],
    applied: [],
    discarded: [],
  },
})

export type AllocationStatus = (typeof allocationMachine.states)[number]
export type ScenarioStatus = (typeof scenarioMachine.states)[number]