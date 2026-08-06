/**
 * The payroll parallel run (plan 7.4, PLAYBOOK §3).
 *
 * The regime this implements is the one thing `STUBS.md` calls non-negotiable before a
 * factory goes live: one month against their own sheet, every net diffed to zero or
 * explained. So the tool that decides "passed" has to be at least as trustworthy as the
 * engine it is checking — a diff that quietly rounds, or matches the wrong two people, would
 * produce a clean report over a payroll that underpays somebody.
 */
import { describe, expect, it } from 'vitest'

import { money } from '@/lib/money'

import {
  ParallelRunError,
  diffPayrollMonth,
  parseSheetCsv,
  parseSheetMoney,
  renderReport,
  splitCsvLine,
  type ComputedRow,
  type SheetRow,
} from '../parallel-run'

const bdt = (amount: string) => money(amount, 'BDT')

const sheet = (employeeNo: string, net: string, over: Partial<SheetRow> = {}): SheetRow => ({
  employeeNo,
  name: `Sheet ${employeeNo}`,
  net: bdt(net),
  ...over,
})

const computed = (employeeNo: string, net: string, over: Partial<ComputedRow> = {}): ComputedRow => ({
  employeeNo,
  name: `Worker ${employeeNo}`,
  net: bdt(net),
  gross: bdt(net),
  totalDeductions: bdt('0.00'),
  ...over,
})

const run = (input: {
  sheet: SheetRow[]
  computed: ComputedRow[]
  explanations?: Record<string, string>
}) =>
  diffPayrollMonth({
    period: '2026-07',
    currency: 'BDT',
    sheet: input.sheet,
    computed: input.computed,
    ...(input.explanations ? { explanations: input.explanations } : {}),
  })

describe('a month that reconciles', () => {
  it('1 · passes when every net agrees to the paisa', () => {
    const report = run({
      sheet: [sheet('4471', '12500.00'), sheet('4472', '9800.50')],
      computed: [computed('4471', '12500.00'), computed('4472', '9800.50')],
    })

    expect(report.passes).toBe(true)
    expect(report.totals.matched).toBe(2)
    expect(report.totals.absoluteNetDrift.amount).toBe('0.00')
  })

  it('2 · one paisa is a difference, not noise', () => {
    /*
     * The whole argument for having no tolerance. One taka out on one worker is either a
     * rounding rule this engine has wrong or one the factory's sheet has wrong, and both are
     * worth knowing before three thousand people are paid by it. A tolerance would swallow
     * exactly the class of bug this regime exists to find.
     */
    const report = run({
      sheet: [sheet('4471', '12500.00')],
      computed: [computed('4471', '12500.01')],
    })

    expect(report.passes).toBe(false)
    expect(report.totals.unexplained).toBe(1)
    expect(report.rows[0]!.netDelta!.amount).toBe('0.01')
  })
})

describe('a difference either reconciles or somebody writes down why', () => {
  it('3 · an explained difference passes and keeps the reason in the report', () => {
    const report = run({
      sheet: [sheet('4471', '11300.00')],
      computed: [computed('4471', '12500.00')],
      explanations: { '4471': 'the sheet netted off a 1,200 advance the system carries forward' },
    })

    expect(report.passes).toBe(true)
    expect(report.rows[0]!.verdict).toBe('explained')
    expect(report.rows[0]!.explanation).toMatch(/advance/)
    // Still counted in the drift. An explanation makes a difference acceptable, not absent —
    // the money is still moving and the owner is still deciding about it.
    expect(report.totals.absoluteNetDrift.amount).toBe('1200.00')
  })

  it('4 · an explanation for a worker who matched is not reported as a difference', () => {
    // A stale line in the explanations file, left over from last month. It must not turn a
    // clean row into one that reads as though it needed excusing.
    const report = run({
      sheet: [sheet('4471', '12500.00')],
      computed: [computed('4471', '12500.00')],
      explanations: { '4471': 'left over from June' },
    })

    expect(report.rows[0]!.verdict).toBe('matched')
    expect(report.rows[0]!.explanation).toBeUndefined()
  })
})

describe('a person in one list and not the other', () => {
  it('5 · a worker the system does not know FAILS, explanation or not', () => {
    /*
     * The row that must never be excusable. "Explained" is a judgement about an AMOUNT —
     * two records disagree about money and somebody understands why. A person in the sheet
     * and absent from the run is a disagreement about who works here, and going live means
     * they are simply not paid. No sentence in a text file makes that safe.
     */
    const report = run({
      sheet: [sheet('4471', '12500.00'), sheet('9999', '8000.00')],
      computed: [computed('4471', '12500.00')],
      explanations: { '9999': 'left in June, sheet not updated' },
    })

    expect(report.passes).toBe(false)
    expect(report.totals.missingFromRun).toBe(1)
    // The reason is still shown — whoever reads it needs to see the claim being made.
    expect(report.rows[0]!.explanation).toMatch(/left in June/)
  })

  it('6 · a worker the SHEET does not know also fails', () => {
    // Less alarming and still not passable: this system is about to pay somebody the
    // factory's own records do not have on this month's list.
    const report = run({
      sheet: [sheet('4471', '12500.00')],
      computed: [computed('4471', '12500.00'), computed('5000', '7000.00')],
    })

    expect(report.passes).toBe(false)
    expect(report.totals.missingFromSheet).toBe(1)
  })

  it('7 · reads worst-first, so the top of the report is the work', () => {
    const report = run({
      sheet: [sheet('1', '100.00'), sheet('2', '100.00'), sheet('3', '100.00'), sheet('9', '5.00')],
      computed: [
        computed('1', '100.00'),
        computed('2', '111.00'),
        computed('3', '122.00'),
        computed('8', '5.00'),
      ],
      explanations: { '3': 'agreed arrear' },
    })

    expect(report.rows.map((row) => row.verdict)).toEqual([
      'unexplained',
      'missing_from_run',
      'missing_from_sheet',
      'explained',
      'matched',
    ])
  })
})

describe('the drift is the money at stake', () => {
  it('8 · does not let an overpayment cancel an underpayment', () => {
    /*
     * Two workers, one paid 500 too much and one 500 too little, net off to nothing. That is
     * two people with the wrong pay, not a clean month — so the figure is ABSOLUTE. A netted
     * total would report the worst possible case as zero.
     */
    const report = run({
      sheet: [sheet('1', '10000.00'), sheet('2', '10000.00')],
      computed: [computed('1', '10500.00'), computed('2', '9500.00')],
      explanations: { '1': 'x', '2': 'y' },
    })

    expect(report.totals.absoluteNetDrift.amount).toBe('1000.00')
  })

  it('9 · localises a fault to deductions when gross agrees', () => {
    // Most of the work of reading one of these reports. A net that differs while gross
    // matches says the engine and the sheet disagree about deductions, not about earnings.
    const report = run({
      sheet: [sheet('1', '9000.00', { gross: bdt('10000.00'), totalDeductions: bdt('1000.00') })],
      computed: [
        computed('1', '9500.00', { gross: bdt('10000.00'), totalDeductions: bdt('500.00') }),
      ],
    })

    expect(report.rows[0]!.grossDelta!.amount).toBe('0.00')
    expect(report.rows[0]!.deductionsDelta!.amount).toBe('-500.00')
  })
})

describe("reading the factory's sheet", () => {
  it('10 · handles quoted names with commas', () => {
    // "Rahman, Md. Abdur" is the normal case in an English transliteration, not an edge one.
    expect(splitCsvLine('4471,"Rahman, Md. Abdur",12500.00')).toEqual([
      '4471',
      'Rahman, Md. Abdur',
      '12500.00',
    ])
  })

  it('11 · handles a doubled quote inside a field', () => {
    expect(splitCsvLine('1,"He said ""yes""",5')).toEqual(['1', 'He said "yes"', '5'])
  })

  it('12 · reads the amounts a payroll sheet actually contains', () => {
    expect(parseSheetMoney('12,500.00', 'BDT', 'x').amount).toBe('12500.00')
    expect(parseSheetMoney('Tk 12,500', 'BDT', 'x').amount).toBe('12500.00')
    expect(parseSheetMoney('৳12,500.50', 'BDT', 'x').amount).toBe('12500.50')
    // Accounting notation. A sheet writing a negative this way and being read as positive
    // would flip the sign of a whole class of correction.
    expect(parseSheetMoney('(1,200.00)', 'BDT', 'x').amount).toBe('-1200.00')
  })

  it('13 · refuses an amount it cannot read rather than calling it zero', () => {
    /*
     * The dangerous default. Treating an unreadable cell as 0 would report that worker as
     * differing by their entire salary — or, worse, as matching a computed zero.
     */
    expect(() => parseSheetMoney('n/a', 'BDT', 'row 7')).toThrow(/row 7/)
    expect(() => parseSheetMoney('', 'BDT', 'row 7')).toThrow(ParallelRunError)
  })

  it('14 · accepts the column names real exports use', () => {
    const rows = parseSheetCsv('Employee No,Name,Net Pay\n4471,Abdur,12500.00\n', 'BDT')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ employeeNo: '4471', name: 'Abdur' })
    expect(rows[0]!.net.amount).toBe('12500.00')
  })

  it('15 · needs only an employee number and a net', () => {
    // A factory whose sheet carries nothing else can still run the regime. The optional
    // columns sharpen the report; they are not a precondition for having one.
    const rows = parseSheetCsv('emp_no,net\n4471,12500\n', 'BDT')

    expect(rows[0]!.gross).toBeUndefined()
    expect(rows[0]!.net.amount).toBe('12500.00')
  })

  it('16 · says what it was looking for when the columns do not match', () => {
    // The person hitting this has a spreadsheet from a factory and no idea what this wanted.
    expect(() => parseSheetCsv('a,b\n1,2\n', 'BDT')).toThrow(/Recognised employee headers/)
  })

  it('17 · refuses a duplicated employee rather than taking the last line', () => {
    /*
     * Two lines for one person is how a sheet records a mid-month grade change. Silently
     * keeping the last would compare the month against half their pay and report a
     * difference nobody could explain.
     */
    expect(() => parseSheetCsv('emp_no,net\n4471,6000\n4471,6500\n', 'BDT')).toThrow(/twice/)
  })
})

describe('the report', () => {
  it('18 · says PASSED or FAILED, never a percentage', () => {
    /*
     * "97% matched" is not a sentence anybody can make a go-live decision from — it is 90
     * workers with the wrong pay in a factory of three thousand. The verdict is binary and
     * the rows are the evidence.
     */
    const failing = renderReport(
      run({ sheet: [sheet('1', '10.00')], computed: [computed('1', '11.00')] }),
    )

    expect(failing).toContain('**FAILED.**')
    expect(failing).not.toMatch(/\d+% matched/)
    expect(failing).toContain('| 1 | Worker 1 | unexplained |')

    const passing = renderReport(
      run({ sheet: [sheet('1', '10.00')], computed: [computed('1', '10.00')] }),
    )
    expect(passing).toContain('**PASSED.**')
  })

  it('19 · lists every non-zero row, and no matched ones', () => {
    const report = renderReport(
      run({
        sheet: [sheet('1', '10.00'), sheet('2', '20.00')],
        computed: [computed('1', '10.00'), computed('2', '25.00')],
      }),
    )

    expect(report).toContain('| 2 |')
    expect(report).not.toMatch(/\| 1 \| Worker 1 \| matched/)
  })
})
