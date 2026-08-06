/**
 * The payroll parallel run (plan 7.4, PLAYBOOK §3, docs/06-quality).
 *
 * The quality document names one regime for this module and has done since it was written:
 *
 *   "one-month parallel run vs the factory's Excel with every net diffed to zero or explained"
 *
 * It has never run. The engine has fifteen gazette vectors and a determinism test; it has
 * never met a real gazette, a real month of attendance, or a factory's own sheet. `STUBS.md`
 * calls that non-negotiable before go-live, and there was no tool with which to do it.
 *
 * This is that tool's arithmetic. The CLI around it is `scripts/payroll-parallel-run.ts`.
 *
 * ## Why "zero or explained" and not a tolerance
 *
 * A tolerance would be the wrong shape. One taka out on one worker is not noise — it is
 * either a rounding rule this engine has wrong, or one the factory's sheet has wrong, and
 * both are worth knowing before three thousand people are paid by it. So a difference either
 * reconciles exactly or somebody writes down why, by employee number, in a file that goes in
 * the commit.
 *
 * The explanations are the deliverable as much as the zeroes. "Worker 4471 differs by 1,200
 * because the sheet paid an advance the system carries forward" is the sentence that makes a
 * go-live decision possible; "97% matched" is not.
 *
 * ## Everything here is exact
 *
 * `lib/money` throughout, on scaled BigInt. A parallel run that compared floats would produce
 * differences of 0.000001 and teach whoever read the report to skim it.
 */
import { add, compare, money, subtract, type Money } from '@/lib/money'

/** One worker's line from the factory's existing sheet. */
export interface SheetRow {
  /** The factory's own identifier, matched against `workers.employee_no`. */
  employeeNo: string
  /** Their name as the sheet has it — for the report, never for matching. */
  name?: string
  net: Money
  /** Optional. When present they are diffed too, which localises a mismatch. */
  gross?: Money
  totalDeductions?: Money
}

/** One worker's line as this system computed it. */
export interface ComputedRow {
  employeeNo: string
  name: string
  net: Money
  gross: Money
  totalDeductions: Money
}

/** Why a known difference is accepted. Keyed by employee number. */
export type Explanations = Readonly<Record<string, string>>

export type Verdict =
  /** The nets agree exactly. */
  | 'matched'
  /** They differ, and somebody has written down why. */
  | 'explained'
  /** They differ and nobody has. This is what fails the run. */
  | 'unexplained'
  /** In the sheet, not in the run — the system does not know this person. */
  | 'missing_from_run'
  /** In the run, not in the sheet — the system is about to pay somebody the sheet does not. */
  | 'missing_from_sheet'

export interface Difference {
  employeeNo: string
  name: string
  verdict: Verdict
  /** `computed − sheet`. Positive means this system pays MORE. Null when one side is absent. */
  netDelta: Money | null
  grossDelta: Money | null
  deductionsDelta: Money | null
  sheetNet: Money | null
  computedNet: Money | null
  explanation?: string
}

export interface ParallelRunReport {
  period: string
  currency: string
  /** Every worker in either list, worst first — see `rank`. */
  rows: Difference[]
  totals: {
    workers: number
    matched: number
    explained: number
    unexplained: number
    missingFromRun: number
    missingFromSheet: number
    /** Sum of |netDelta| over every row that differs, explained or not. */
    absoluteNetDrift: Money
  }
  /**
   * The regime's own question: may this go live?
   *
   * True only when every worker on both sides reconciles or carries a written reason. A
   * missing worker is never passable — a person in the sheet the system does not know is a
   * person who does not get paid.
   */
  passes: boolean
}

/**
 * The order somebody should read this in.
 *
 * Unexplained first, then people missing from one side, then explained, then matched. The
 * top of the report is the work; the bottom is the evidence.
 */
const RANK: Record<Verdict, number> = {
  unexplained: 0,
  missing_from_run: 1,
  missing_from_sheet: 2,
  explained: 3,
  matched: 4,
}

const isZero = (value: Money): boolean => compare(value, money(0, value.currency)) === 0

const absolute = (value: Money): Money =>
  compare(value, money(0, value.currency)) < 0
    ? subtract(money(0, value.currency), value)
    : value

/**
 * Diff a month.
 *
 * Matched on employee number, never on name: two workers called Md. Rahman on one floor is
 * the normal case in a Bangladeshi factory, not an edge case, and a name match would silently
 * pair the wrong two people and report a difference that is really two people's pay swapped.
 */
export function diffPayrollMonth(input: {
  period: string
  currency: string
  sheet: readonly SheetRow[]
  computed: readonly ComputedRow[]
  explanations?: Explanations
}): ParallelRunReport {
  const explanations = input.explanations ?? {}
  const zeroMoney = money(0, input.currency)

  const bySheet = new Map(input.sheet.map((row) => [row.employeeNo, row]))
  const byComputed = new Map(input.computed.map((row) => [row.employeeNo, row]))

  const everyone = [...new Set([...bySheet.keys(), ...byComputed.keys()])]
  const rows: Difference[] = []

  for (const employeeNo of everyone) {
    const sheet = bySheet.get(employeeNo)
    const computed = byComputed.get(employeeNo)
    const explanation = explanations[employeeNo]

    if (!computed) {
      /*
       * In the sheet and not in the run. The worst row in the report: somebody the factory
       * is paying today whom this system does not know about, so going live would simply not
       * pay them. An explanation does NOT clear it — see `passes`.
       */
      rows.push({
        employeeNo,
        name: sheet?.name ?? employeeNo,
        verdict: 'missing_from_run',
        netDelta: null,
        grossDelta: null,
        deductionsDelta: null,
        sheetNet: sheet?.net ?? null,
        computedNet: null,
        ...(explanation ? { explanation } : {}),
      })
      continue
    }

    if (!sheet) {
      // In the run and not in the sheet. Less alarming and still not passable: this system
      // is about to pay somebody the factory's own records do not have on this month's list.
      rows.push({
        employeeNo,
        name: computed.name,
        verdict: 'missing_from_sheet',
        netDelta: null,
        grossDelta: null,
        deductionsDelta: null,
        sheetNet: null,
        computedNet: computed.net,
        ...(explanation ? { explanation } : {}),
      })
      continue
    }

    const netDelta = subtract(computed.net, sheet.net)
    const matched = isZero(netDelta)

    rows.push({
      employeeNo,
      name: computed.name,
      verdict: matched ? 'matched' : explanation ? 'explained' : 'unexplained',
      netDelta,
      // Diffed when the sheet carries them, because a net that differs while gross agrees
      // localises the fault to deductions immediately — which is most of the work of reading
      // one of these reports.
      grossDelta: sheet.gross ? subtract(computed.gross, sheet.gross) : null,
      deductionsDelta: sheet.totalDeductions
        ? subtract(computed.totalDeductions, sheet.totalDeductions)
        : null,
      sheetNet: sheet.net,
      computedNet: computed.net,
      ...(explanation && !matched ? { explanation } : {}),
    })
  }

  rows.sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || a.employeeNo.localeCompare(b.employeeNo))

  const count = (verdict: Verdict) => rows.filter((row) => row.verdict === verdict).length

  /*
   * ABSOLUTE, deliberately. Two workers, one paid 500 too much and one 500 too little, net
   * off to nothing — and that is two people with the wrong pay, not a clean month. This is
   * the money at stake, which is the number a factory owner is actually deciding about.
   */
  let drift = zeroMoney
  for (const row of rows) {
    if (row.netDelta && !isZero(row.netDelta)) drift = add(drift, absolute(row.netDelta))
  }

  const totals = {
    workers: rows.length,
    matched: count('matched'),
    explained: count('explained'),
    unexplained: count('unexplained'),
    missingFromRun: count('missing_from_run'),
    missingFromSheet: count('missing_from_sheet'),
    absoluteNetDrift: drift,
  }

  return {
    period: input.period,
    currency: input.currency,
    rows,
    totals,
    /*
     * A missing worker fails the run even with a note against them.
     *
     * "Explained" is a judgement about an AMOUNT — this system and the sheet disagree about
     * money, and somebody understands why. A person present in one list and absent from the
     * other is not a disagreement about money; it is a disagreement about who works here, and
     * no sentence in a text file makes it safe to pay from.
     */
    passes:
      totals.unexplained === 0 && totals.missingFromRun === 0 && totals.missingFromSheet === 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The factory's sheet
// ─────────────────────────────────────────────────────────────────────────────

export class ParallelRunError extends Error {
  override readonly name = 'ParallelRunError'
}

/**
 * Split one CSV line, honouring quotes and doubled quotes.
 *
 * Hand-written rather than a dependency, and small enough to read in one go. A payroll export
 * from Excel quotes any field containing a comma — which in Bangladesh is most names in
 * English transliteration ("Rahman, Md. Abdur") and every amount above a thousand if the
 * sheet was formatted before export.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!

    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') quoted = true
    else if (ch === ',') {
      fields.push(field)
      field = ''
    } else field += ch
  }

  fields.push(field)
  return fields.map((value) => value.trim())
}

/**
 * A money value as a payroll sheet writes it.
 *
 * Thousands separators and a currency symbol are stripped; `(1,200.00)` is accounting notation
 * for a negative and is honoured. Anything else throws with the row in the message, because a
 * value this cannot read is one somebody must look at — silently treating it as zero would
 * report a worker as differing by their entire salary.
 */
export function parseSheetMoney(raw: string, currency: string, where: string): Money {
  const trimmed = raw.trim()
  if (!trimmed) throw new ParallelRunError(`${where}: empty amount`)

  const negative = /^\(.*\)$/.test(trimmed)
  const cleaned = trimmed
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[,\s]/g, '')
    .replace(/^(BDT|Tk\.?|৳)/i, '')

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new ParallelRunError(`${where}: "${raw}" is not an amount this can read`)
  }

  return money(negative ? `-${cleaned}` : cleaned, currency)
}

/** Column names a real export might use, in the order they are tried. */
const COLUMNS = {
  employeeNo: ['employee_no', 'employee no', 'employee', 'emp_no', 'empno', 'id', 'card_no'],
  name: ['name', 'worker_name', 'employee_name'],
  net: ['net', 'net_pay', 'net pay', 'net_salary', 'net amount', 'take_home'],
  gross: ['gross', 'gross_pay', 'gross salary', 'gross_salary'],
  deductions: ['deductions', 'total_deductions', 'total deduction', 'deduction'],
} as const

function findColumn(header: readonly string[], names: readonly string[]): number {
  const normalised = header.map((h) => h.toLowerCase().replace(/[\s_-]+/g, '_'))
  for (const name of names) {
    const at = normalised.indexOf(name.replace(/[\s_-]+/g, '_'))
    if (at !== -1) return at
  }
  return -1
}

/**
 * Read a factory's payroll export.
 *
 * Column names are matched from a list of what real exports call things, because the sheet
 * comes from the factory and asking them to rename headers before a parallel run is asking
 * them to edit the evidence.
 *
 * Only `employee_no` and `net` are required — a factory whose sheet carries nothing else can
 * still run the regime, and the optional columns only sharpen the report.
 */
export function parseSheetCsv(text: string, currency: string): SheetRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new ParallelRunError('the sheet has a header and no rows')
  }

  const header = splitCsvLine(lines[0]!)
  const at = {
    employeeNo: findColumn(header, COLUMNS.employeeNo),
    name: findColumn(header, COLUMNS.name),
    net: findColumn(header, COLUMNS.net),
    gross: findColumn(header, COLUMNS.gross),
    deductions: findColumn(header, COLUMNS.deductions),
  }

  if (at.employeeNo === -1 || at.net === -1) {
    throw new ParallelRunError(
      `the sheet needs an employee number and a net column. Found: ${header.join(', ')}.\n` +
        `Recognised employee headers: ${COLUMNS.employeeNo.join(', ')}\n` +
        `Recognised net headers: ${COLUMNS.net.join(', ')}`,
    )
  }

  const rows: SheetRow[] = []

  for (const [i, line] of lines.slice(1).entries()) {
    const fields = splitCsvLine(line)
    const where = `row ${i + 2}`
    const employeeNo = fields[at.employeeNo]?.trim()

    if (!employeeNo) throw new ParallelRunError(`${where}: no employee number`)

    rows.push({
      employeeNo,
      ...(at.name !== -1 && fields[at.name] ? { name: fields[at.name]! } : {}),
      net: parseSheetMoney(fields[at.net] ?? '', currency, `${where} (${employeeNo}) net`),
      ...(at.gross !== -1 && fields[at.gross]
        ? { gross: parseSheetMoney(fields[at.gross]!, currency, `${where} (${employeeNo}) gross`) }
        : {}),
      ...(at.deductions !== -1 && fields[at.deductions]
        ? {
            totalDeductions: parseSheetMoney(
              fields[at.deductions]!,
              currency,
              `${where} (${employeeNo}) deductions`,
            ),
          }
        : {}),
    })
  }

  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.employeeNo)) {
      // Two lines for one person is how a factory's sheet records a mid-month grade change,
      // and silently taking the last would compare against half their pay.
      throw new ParallelRunError(
        `employee ${row.employeeNo} appears twice. Consolidate the sheet, or explain which ` +
          'line is the month — this tool will not guess.',
      )
    }
    seen.add(row.employeeNo)
  }

  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// The report
// ─────────────────────────────────────────────────────────────────────────────

const AMOUNT = (value: Money | null): string => (value ? value.amount : '—')

/**
 * The report, as somebody signing off a go-live reads it.
 *
 * Markdown, because it goes in the commit beside the explanations file and is the evidence
 * that the regime ran. The JSON next to it is for anything that wants to diff two months.
 */
export function renderReport(report: ParallelRunReport): string {
  const { totals } = report
  const out: string[] = []

  out.push(`# Payroll parallel run — ${report.period}`)
  out.push('')
  out.push(
    report.passes
      ? '**PASSED.** Every worker reconciles to the paisa or carries a written reason.'
      : '**FAILED.** See the rows at the top — a run does not pass on a percentage.',
  )
  out.push('')
  out.push(`- workers compared: **${totals.workers}**`)
  out.push(`- matched exactly: **${totals.matched}**`)
  out.push(`- differing, explained: **${totals.explained}**`)
  out.push(`- differing, UNEXPLAINED: **${totals.unexplained}**`)
  out.push(`- in the sheet, not in the run: **${totals.missingFromRun}**`)
  out.push(`- in the run, not in the sheet: **${totals.missingFromSheet}**`)
  out.push(
    `- absolute net drift: **${totals.absoluteNetDrift.amount} ${report.currency}** ` +
      '(sum of every difference, explained or not — the money at stake, not a net-off)',
  )
  out.push('')

  const differing = report.rows.filter((row) => row.verdict !== 'matched')

  if (differing.length > 0) {
    out.push('## Every row that is not exactly zero')
    out.push('')
    out.push('| employee | name | verdict | sheet net | computed net | Δ net | Δ gross | why |')
    out.push('|---|---|---|---|---|---|---|---|')
    for (const row of differing) {
      out.push(
        `| ${row.employeeNo} | ${row.name} | ${row.verdict} | ${AMOUNT(row.sheetNet)} | ` +
          `${AMOUNT(row.computedNet)} | ${AMOUNT(row.netDelta)} | ${AMOUNT(row.grossDelta)} | ` +
          `${row.explanation ?? ''} |`,
      )
    }
    out.push('')
  }

  out.push('---')
  out.push('')
  out.push(
    'Regime: PLAYBOOK §3 and `docs/06-quality/testing-and-pressure.md` — one month against ' +
      "the factory's own sheet, every net diffed to zero or explained. A tolerance is not " +
      'part of it: one taka out on one worker is a rounding rule somebody has wrong.',
  )

  return `${out.join('\n')}\n`
}
