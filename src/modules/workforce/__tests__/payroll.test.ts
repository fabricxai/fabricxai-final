/**
 * Payroll vectors — written BEFORE the implementation (PLAYBOOK §3, 10.1 addendum:
 * "gazette test vectors FIRST … then the pure compute function until all pass").
 *
 * ── About the numbers in this file ──────────────────────────────────────────
 *
 * The grade table below is a FIXTURE. It is not the Bangladesh minimum wage gazette and
 * must never be treated as one. Real rates are uploaded by the factory as a versioned
 * `wage_grades` dataset and pinned per payroll run, precisely so that no rate is ever
 * hardcoded in this repo — a gazette changes by government notification, and a system
 * that needs a deploy to pay people correctly is a system that pays people late.
 *
 * What these vectors test is the ENGINE: how a month is pro-rated, how overtime is
 * derived from basic, how a partial month and unpaid leave interact, how a festival
 * bonus is earned. Those behaviours are independent of what the rates happen to be, and
 * they are what a wrong implementation gets wrong.
 *
 * Two constants ARE law rather than policy and are asserted as such:
 *   - overtime is paid at 2× the basic hourly rate
 *   - the basic hourly rate is basic ÷ 208  (8 hours × 26 days)
 *
 * Before any real factory go-live: one full month parallel-run against their existing
 * sheet, diffing every net figure (PLAYBOOK §3).
 */
import { describe, expect, it } from 'vitest'

import {
  computePayroll,
  PayrollError,
  type PayrollRules,
  type WageGrade,
  type WorkerPayrollInput,
} from '../payroll'

/** FIXTURE ONLY — invented figures, chosen to make arithmetic errors visible. */
const GAZETTE: WageGrade[] = [
  { grade: '7', basic: '5000.00', houseRent: '2500.00', medical: '750.00', transport: '450.00', food: '1250.00' },
  { grade: '6', basic: '6000.00', houseRent: '3000.00', medical: '750.00', transport: '450.00', food: '1250.00' },
  { grade: '4', basic: '8000.00', houseRent: '4000.00', medical: '750.00', transport: '450.00', food: '1250.00' },
]

const RULES: PayrollRules = {
  currency: 'BDT',
  /** BD practice: a wage month is 30 days regardless of calendar length. */
  monthDays: 30,
  attendanceBonus: '1000.00',
  attendanceBonusMaxAbsentDays: 0,
  festivalBonusBasicPct: '100',
  festivalBonusMinServiceMonths: 12,
}

const worker = (over: Partial<WorkerPayrollInput> = {}): WorkerPayrollInput => ({
  workerId: 'w-1',
  grade: '7',
  joinDate: '2024-01-01',
  exitDate: null,
  presentDays: 26,
  paidLeaveDays: 4,
  unpaidLeaveDays: 0,
  absentDays: 0,
  otHours: '0',
  deductions: [],
  ...over,
})

const run = (workers: WorkerPayrollInput[], over: Partial<PayrollRules> = {}) =>
  computePayroll({
    period: '2026-06',
    grades: GAZETTE,
    rules: { ...RULES, ...over },
    workers,
  })

const only = (workers: WorkerPayrollInput[], over: Partial<PayrollRules> = {}) => {
  const lines = run(workers, over)
  const line = lines[0]
  if (!line) throw new Error('no payroll line produced')
  return line
}

// ─────────────────────────────────────────────────────────────────────────────
// Components and gross
// ─────────────────────────────────────────────────────────────────────────────

describe('computePayroll · a full month', () => {
  it('1 · pays every component of the worker’s grade', () => {
    const line = only([worker()])

    expect(line.components).toEqual({
      basic: '5000.00',
      houseRent: '2500.00',
      medical: '750.00',
      transport: '450.00',
      food: '1250.00',
    })
    expect(line.gross).toBe('10950.00') // 5000+2500+750+450+1250 + 1000 attendance
  })

  it('2 · reads each grade from its own row', () => {
    const lines = run([
      worker({ workerId: 'w-7', grade: '7' }),
      worker({ workerId: 'w-4', grade: '4' }),
    ])

    expect(lines.find((l) => l.workerId === 'w-7')?.components.basic).toBe('5000.00')
    expect(lines.find((l) => l.workerId === 'w-4')?.components.basic).toBe('8000.00')
  })

  it('3 · refuses a grade the uploaded gazette does not define', () => {
    // Unknown is not zero. A worker on a grade the gazette does not cover means the
    // gazette upload is incomplete, and paying them nothing is the worst possible guess.
    expect(() => run([worker({ grade: '99' })])).toThrow(PayrollError)
    expect(() => run([worker({ grade: '99' })])).toThrow(/grade "99"/)
  })

  it('4 · refuses to run with no gazette at all', () => {
    expect(() =>
      computePayroll({ period: '2026-06', grades: [], rules: RULES, workers: [worker()] }),
    ).toThrow(/gazette/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Overtime — the two figures that are law, not policy
// ─────────────────────────────────────────────────────────────────────────────

describe('computePayroll · overtime', () => {
  it('5 · pays 2× the basic hourly rate, where hourly is basic ÷ 208', () => {
    // 5000 × 2 × 20 / 208 = 961.538… → 961.54
    const line = only([worker({ otHours: '20' })])
    expect(line.otAmount).toBe('961.54')
  })

  it('6 · rounds once, not per hour', () => {
    // Deriving an hourly rate first (5000/208 = 24.04) and multiplying would give
    // 961.60 — sixty paisa adrift on one worker, and it compounds across a factory.
    expect(only([worker({ otHours: '20' })]).otAmount).toBe('961.54')
  })

  it('7 · handles part hours', () => {
    // 5000 × 2 × 7.5 / 208 = 360.576… → 360.58
    expect(only([worker({ otHours: '7.5' })]).otAmount).toBe('360.58')
  })

  it('8 · zero overtime is zero, not absent', () => {
    const line = only([worker({ otHours: '0' })])
    expect(line.otAmount).toBe('0.00')
    expect(line.otHours).toBe('0.00')
  })

  it('9 · refuses negative overtime', () => {
    expect(() => run([worker({ otHours: '-4' })])).toThrow(PayrollError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Partial months and leave
// ─────────────────────────────────────────────────────────────────────────────

describe('computePayroll · partial month', () => {
  it('10 · pro-rates a worker who joined mid-month', () => {
    // Joined on the 16th: 15 of 30 days.
    const line = only([worker({ joinDate: '2026-06-16', presentDays: 13, paidLeaveDays: 2 })])

    expect(line.payableDays).toBe(15)
    expect(line.components.basic).toBe('2500.00')
    expect(line.components.houseRent).toBe('1250.00')
  })

  it('11 · pro-rates a worker who left mid-month', () => {
    const line = only([worker({ exitDate: '2026-06-10', presentDays: 9, paidLeaveDays: 1 })])

    expect(line.payableDays).toBe(10)
    expect(line.components.basic).toBe('1666.67') // 5000 × 10/30, half-up
  })

  it('12 · unpaid leave reduces payable days; paid leave does not', () => {
    const paid = only([worker({ presentDays: 22, paidLeaveDays: 8 })])
    expect(paid.payableDays).toBe(30)
    expect(paid.components.basic).toBe('5000.00')

    const unpaid = only([worker({ presentDays: 22, paidLeaveDays: 0, unpaidLeaveDays: 8 })])
    expect(unpaid.payableDays).toBe(22)
    expect(unpaid.components.basic).toBe('3666.67') // 5000 × 22/30
  })

  it('13 · absence reduces payable days and forfeits the attendance bonus', () => {
    const line = only([worker({ presentDays: 25, paidLeaveDays: 4, absentDays: 1 })])

    expect(line.payableDays).toBe(29)
    expect(line.attendanceBonus).toBe('0.00')
  })

  it('14 · a maternity month is paid in full — it is leave, not absence', () => {
    // Maternity is statutory paid leave. Treating it as absence is both wrong and the
    // kind of wrong that ends up in a compliance audit.
    const line = only([worker({ presentDays: 0, paidLeaveDays: 30 })])

    expect(line.payableDays).toBe(30)
    expect(line.components.basic).toBe('5000.00')
    expect(line.net).not.toBe('0.00')
  })

  it('15 · refuses a day count that exceeds the wage month', () => {
    // 26 present + 8 paid leave = 34 days in a 30-day wage month. Somebody's attendance
    // import is double-counting, and paying on it would be silently generous.
    expect(() => run([worker({ presentDays: 26, paidLeaveDays: 8 })])).toThrow(/exceed/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Festival bonus, deductions, net
// ─────────────────────────────────────────────────────────────────────────────

describe('computePayroll · bonus and deductions', () => {
  it('16 · pays a full festival bonus after the qualifying service period', () => {
    const line = only([worker({ joinDate: '2024-01-01', festival: 'eid-ul-fitr' })])
    // 100% of basic.
    expect(line.festivalBonus).toBe('5000.00')
  })

  it('17 · pro-rates a festival bonus for short service', () => {
    // Joined 2026-01-01, festival in the 2026-06 period: 6 of 12 qualifying months.
    const line = only([worker({ joinDate: '2026-01-01', festival: 'eid-ul-fitr' })])
    expect(line.festivalBonus).toBe('2500.00')
  })

  it('18 · pays no festival bonus when no festival falls in the period', () => {
    expect(only([worker()]).festivalBonus).toBe('0.00')
  })

  it('19 · subtracts deductions to reach net', () => {
    const line = only([
      worker({
        deductions: [
          { code: 'advance', amount: '500.00' },
          { code: 'canteen', amount: '250.00' },
        ],
      }),
    ])

    expect(line.totalDeductions).toBe('750.00')
    expect(line.net).toBe('10200.00') // 10950 − 750
  })

  it('20 · never lets deductions drive net below zero', () => {
    // A worker cannot owe the factory money out of a payslip. The excess carries, it does
    // not become a negative wage.
    const line = only([worker({ deductions: [{ code: 'advance', amount: '99999.00' }] })])

    expect(line.net).toBe('0.00')
    expect(line.deductionCarryForward).toBe('89049.00')
  })

  it('21 · is deterministic — the same inputs produce the same line', () => {
    // A payroll run has to be re-runnable to be auditable: "recompute it and show me"
    // must give the same answer.
    const input = worker({ otHours: '13.25', deductions: [{ code: 'advance', amount: '300.00' }] })
    expect(only([input])).toEqual(only([input]))
  })

  it('22 · flags an overtime anomaly instead of silently paying it', () => {
    // Brief §Operations: OT > 2.5× the worker's 3-month average is flagged on the line.
    const line = only([worker({ otHours: '60', threeMonthAvgOtHours: '10' })])

    expect(line.otAmount).not.toBe('0.00') // still computed — flagged, not withheld
    expect(line.flags).toContainEqual(
      expect.objectContaining({ code: 'ot_above_average' }),
    )
  })
})
