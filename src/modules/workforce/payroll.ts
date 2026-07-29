/**
 * Payroll compute — a pure function (brief 10.1 §Operations), 🔒.
 *
 * `(workers, attendance, grades, rules) → lines`. No database, no clock, no I/O, and
 * crucially **no rates**: the grade table is a parameter.
 *
 * That last point is the design. Bangladesh minimum wages are set by government gazette
 * and change by notification; a factory uploads its gazette as a versioned `wage_grades`
 * dataset and each payroll run pins the version it used. Hardcoding rates here would mean
 * a deploy is required to pay people correctly after a notification — which is how people
 * get paid late, or wrong, at the exact moment a raise was announced. It also means this
 * engine works for a factory whose gazette we have never seen.
 *
 * Two constants ARE law rather than factory policy, and are named here rather than passed
 * in, because a factory cannot choose them:
 *   - overtime is paid at 2× the basic hourly rate
 *   - the basic hourly rate is basic ÷ 208  (8 hours × 26 days)
 *
 * Everything else — the wage month length, attendance bonus, festival percentage,
 * qualifying service — is factory policy and arrives in `rules`, which the run snapshots
 * so a recompute a year later reproduces the same figures.
 *
 * All arithmetic goes through `lib/money` (CLAUDE.md rule 4). A float in this file is a
 * wrong payslip for 2,400 people.
 */
import { add, type Money, money, mulDiv, multiply, subtract, sum, zero } from '@/lib/money'

export class PayrollError extends Error {
  override readonly name = 'PayrollError'
}

/** Overtime multiplier. Bangladesh Labour Act — not a factory setting. */
export const OT_MULTIPLIER = 2
/** Hours in a wage month for hourly derivation: 8 hours × 26 days. Also statutory. */
export const HOURS_PER_MONTH = 208

/** One row of the factory's uploaded gazette. Amounts are decimal strings. */
export interface WageGrade {
  grade: string
  basic: string
  houseRent: string
  medical: string
  transport: string
  food: string
}

/** Factory policy, snapshotted onto the run so a recompute reproduces it. */
export interface PayrollRules {
  currency: string
  /** Days in a wage month for pro-rating. BD practice is a flat 30. */
  monthDays: number
  /** Paid when attendance is clean. Null if the factory does not run one. */
  attendanceBonus: string | null
  attendanceBonusMaxAbsentDays: number
  /** Festival bonus as a percentage of basic, e.g. '100'. */
  festivalBonusBasicPct: string
  /** Service needed for a full festival bonus; shorter service is pro-rated. */
  festivalBonusMinServiceMonths: number
}

export interface PayrollDeduction {
  code: string
  amount: string
}

export interface WorkerPayrollInput {
  workerId: string
  grade: string
  joinDate: string
  exitDate?: string | null
  presentDays: number
  paidLeaveDays: number
  unpaidLeaveDays: number
  absentDays: number
  /** Decimal string — overtime is recorded in part hours. */
  otHours: string
  deductions: readonly PayrollDeduction[]
  /** Set when a festival falls in this period; drives the bonus. */
  festival?: string | null
  /** For the anomaly detector. Absent means no baseline yet, so no flag. */
  threeMonthAvgOtHours?: string | null
}

export interface PayrollFlag {
  code: string
  /** i18n key — never a display string. */
  messageKey: string
  facts: Record<string, string | number>
}

export interface PayrollLine {
  workerId: string
  grade: string
  payableDays: number
  components: {
    basic: string
    houseRent: string
    medical: string
    transport: string
    food: string
  }
  otHours: string
  otAmount: string
  attendanceBonus: string
  festivalBonus: string
  gross: string
  deductions: readonly PayrollDeduction[]
  totalDeductions: string
  net: string
  /** Deductions that would have driven net below zero. Carried, never netted off. */
  deductionCarryForward: string
  flags: readonly PayrollFlag[]
}

export interface PayrollComputeInput {
  /** `YYYY-MM`. */
  period: string
  grades: readonly WageGrade[]
  rules: PayrollRules
  workers: readonly WorkerPayrollInput[]
}

const DECIMAL = /^\d+(\.\d+)?$/
const PERIOD = /^\d{4}-\d{2}$/

/** OT above this multiple of the worker's own 3-month average is flagged (brief §Ops). */
const OT_ANOMALY_MULTIPLE = 2.5

export function computePayroll(input: PayrollComputeInput): PayrollLine[] {
  if (!PERIOD.test(input.period)) {
    throw new PayrollError(`"${input.period}" is not a payroll period (YYYY-MM)`)
  }
  if (input.grades.length === 0) {
    throw new PayrollError(
      'no gazette grades supplied — upload and activate a wage gazette before running payroll',
    )
  }
  if (input.rules.monthDays <= 0) {
    throw new PayrollError(`monthDays must be positive, got ${input.rules.monthDays}`)
  }

  const gradeByName = new Map(input.grades.map((grade) => [grade.grade, grade]))
  return input.workers.map((worker) => computeLine(worker, gradeByName, input))
}

function computeLine(
  worker: WorkerPayrollInput,
  gradeByName: Map<string, WageGrade>,
  input: PayrollComputeInput,
): PayrollLine {
  const { rules, period } = input
  const currency = rules.currency

  const grade = gradeByName.get(worker.grade)
  if (!grade) {
    // Unknown is not zero. A worker on a grade the uploaded gazette does not cover means
    // the upload is incomplete, and paying them nothing is the worst available guess.
    throw new PayrollError(
      `worker ${worker.workerId} is on grade "${worker.grade}", which the active gazette does not define`,
    )
  }

  if (!DECIMAL.test(worker.otHours)) {
    throw new PayrollError(
      `worker ${worker.workerId} has overtime "${worker.otHours}", which is not a positive decimal`,
    )
  }

  const attendedDays =
    worker.presentDays + worker.paidLeaveDays + worker.unpaidLeaveDays + worker.absentDays
  if (attendedDays > rules.monthDays) {
    throw new PayrollError(
      `worker ${worker.workerId} has ${attendedDays} days recorded, which exceed the ${rules.monthDays}-day wage month`,
    )
  }

  // Employment days cap the month for joiners and leavers; within that, unpaid leave and
  // absence reduce what is payable. Paid leave — including maternity — does not.
  const employedDays = employmentDays(worker, period, rules.monthDays)
  const payableDays = Math.max(
    0,
    Math.min(employedDays, rules.monthDays - worker.unpaidLeaveDays - worker.absentDays),
  )

  const prorate = (amount: string): Money =>
    payableDays >= rules.monthDays
      ? money(amount, currency)
      : mulDiv(money(amount, currency), payableDays, rules.monthDays)

  const components = {
    basic: prorate(grade.basic),
    houseRent: prorate(grade.houseRent),
    medical: prorate(grade.medical),
    transport: prorate(grade.transport),
    food: prorate(grade.food),
  }

  // Overtime is derived from the FULL basic, not the pro-rated one: an hour worked is an
  // hour worked, and the hourly rate does not shrink because someone joined mid-month.
  const otAmount = mulDiv(
    money(grade.basic, currency),
    multiplyHours(worker.otHours, OT_MULTIPLIER),
    HOURS_PER_MONTH,
  )

  const attendanceBonus =
    rules.attendanceBonus && worker.absentDays <= rules.attendanceBonusMaxAbsentDays
      ? money(rules.attendanceBonus, currency)
      : zero(currency)

  const festivalBonus = computeFestivalBonus(worker, grade, rules, period)

  const gross = sum(
    [
      components.basic,
      components.houseRent,
      components.medical,
      components.transport,
      components.food,
      otAmount,
      attendanceBonus,
      festivalBonus,
    ],
    currency,
  )

  const totalDeductions = sum(
    worker.deductions.map((deduction) => money(deduction.amount, currency)),
    currency,
  )

  // A payslip cannot go negative — a worker does not owe the factory money out of their
  // wages. The excess is carried, not netted off.
  const netRaw = subtract(gross, totalDeductions)
  const negative = netRaw.amount.startsWith('-')
  const net = negative ? zero(currency) : netRaw
  const carryForward = negative
    ? subtract(totalDeductions, gross)
    : zero(currency)

  return {
    workerId: worker.workerId,
    grade: worker.grade,
    payableDays,
    components: {
      basic: components.basic.amount,
      houseRent: components.houseRent.amount,
      medical: components.medical.amount,
      transport: components.transport.amount,
      food: components.food.amount,
    },
    otHours: normaliseHours(worker.otHours),
    otAmount: otAmount.amount,
    attendanceBonus: attendanceBonus.amount,
    festivalBonus: festivalBonus.amount,
    gross: gross.amount,
    deductions: worker.deductions,
    totalDeductions: totalDeductions.amount,
    net: net.amount,
    deductionCarryForward: carryForward.amount,
    flags: detectAnomalies(worker),
  }
}

/**
 * Festival bonus: a percentage of basic, pro-rated by service.
 *
 * Two festival bonuses a year, pro-rated for workers with less than the qualifying
 * service (CLAUDE.md domain crib). The qualifying period and percentage are factory
 * policy and arrive in `rules`.
 */
function computeFestivalBonus(
  worker: WorkerPayrollInput,
  grade: WageGrade,
  rules: PayrollRules,
  period: string,
): Money {
  if (!worker.festival) return zero(rules.currency)

  const full = multiply(money(grade.basic, rules.currency), divideBy100(rules.festivalBonusBasicPct))
  const served = serviceMonths(worker.joinDate, period)

  if (served >= rules.festivalBonusMinServiceMonths) return full
  if (served <= 0) return zero(rules.currency)

  return mulDiv(full, served, rules.festivalBonusMinServiceMonths)
}

/**
 * Whole months of service completed by the END of the payroll period.
 *
 * The end, not the start: the bonus is paid with this period's wages, and the worker has
 * worked this month. Someone who joined on 1 January has served six months by the end of
 * June, not five — measuring to the start of the period underpays every recent joiner by
 * one twelfth of a bonus, twice a year.
 *
 * A mid-month joiner has not completed that first month, so it does not count.
 */
function serviceMonths(joinDate: string, period: string): number {
  const [joinYear = 0, joinMonth = 1] = joinDate.split('-').map(Number)
  const [periodYear = 0, periodMonth = 1] = period.split('-').map(Number)

  const spanned = (periodYear - joinYear) * 12 + (periodMonth - joinMonth) + 1
  const firstMonthIncomplete = dayOfMonth(joinDate) > 1 ? 1 : 0

  return Math.max(0, spanned - firstMonthIncomplete)
}

/**
 * Days the worker was actually employed within the period, capped at the wage month.
 * A joiner or leaver is paid for the part of the month they were on the books.
 */
function employmentDays(
  worker: WorkerPayrollInput,
  period: string,
  monthDays: number,
): number {
  const [year = 0, month = 1] = period.split('-').map(Number)
  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const joined = worker.joinDate.startsWith(period) ? dayOfMonth(worker.joinDate) : 1
  const left = worker.exitDate?.startsWith(period) ? dayOfMonth(worker.exitDate) : calendarDays

  if (left < joined) return 0

  const employed = left - joined + 1
  // Scale a calendar-length span onto the fixed wage month, so a 31-day June and a
  // 28-day February pro-rate consistently.
  return employed >= calendarDays ? monthDays : Math.round((employed * monthDays) / calendarDays)
}

const dayOfMonth = (date: string): number => Number(date.slice(8, 10))

/** `hours × multiplier` as an exact decimal string, for the mulDiv numerator. */
function multiplyHours(hours: string, multiplier: number): string {
  const [whole = '0', fraction = ''] = hours.split('.')
  const scaled = BigInt(whole + fraction) * BigInt(multiplier)
  const scale = fraction.length
  if (scale === 0) return scaled.toString()

  const digits = scaled.toString().padStart(scale + 1, '0')
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

function normaliseHours(hours: string): string {
  const [whole = '0', fraction = ''] = hours.split('.')
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`
}

/** Percentage as a decimal factor, without touching a float. */
function divideBy100(pct: string): string {
  const [whole = '0', fraction = ''] = pct.split('.')
  const digits = (whole + fraction).padStart(fraction.length + 3, '0')
  const scale = fraction.length + 2
  return `${digits.slice(0, -scale) || '0'}.${digits.slice(-scale)}`
}

/**
 * Anomalies are FLAGGED, never withheld.
 *
 * A wage the system quietly refuses to pay is a wage dispute; a wage it pays with a flag
 * on it is a question for a supervisor. The brief is explicit that these are flags on the
 * line (§Operations).
 */
function detectAnomalies(worker: WorkerPayrollInput): PayrollFlag[] {
  const flags: PayrollFlag[] = []

  if (worker.threeMonthAvgOtHours && DECIMAL.test(worker.threeMonthAvgOtHours)) {
    const average = Number.parseFloat(worker.threeMonthAvgOtHours)
    const hours = Number.parseFloat(worker.otHours)
    // Comparison only, never an amount — this decides whether to raise a flag, and a
    // fraction of an hour either way changes nothing about what is paid.
    if (average > 0 && hours > average * OT_ANOMALY_MULTIPLE) {
      flags.push({
        code: 'ot_above_average',
        messageKey: 'workforce.payroll.flags.ot_above_average',
        facts: { otHours: worker.otHours, threeMonthAverage: worker.threeMonthAvgOtHours },
      })
    }
  }

  return flags
}

/** Re-exported so callers can total a run without importing the money lib themselves. */
export function totalNet(lines: readonly PayrollLine[], currency: string): string {
  return lines.reduce((total, line) => add(total, money(line.net, currency)), zero(currency)).amount
}
