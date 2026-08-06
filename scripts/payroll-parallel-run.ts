/**
 * `pnpm payroll:parallel-run` — the regime, executed (plan 7.4, PLAYBOOK §3).
 *
 *   pnpm payroll:parallel-run --period=2026-07 --sheet=./july.csv \
 *     [--explanations=./july-explanations.json] [--out=docs/parallel-runs]
 *
 * One month of the factory's own payroll against this system's, every net diffed to zero or
 * explained. `docs/06-quality/testing-and-pressure.md` has named this as the gate for the
 * payroll module since it was written; `STUBS.md` calls it non-negotiable before go-live; and
 * until now there was no tool with which to do it, so it had never been done.
 *
 * ## It computes nothing
 *
 * The run being checked is the one already in the database — `payroll_runs` for the period,
 * with its lines. Recomputing here would compare the engine against itself using this
 * script's idea of the inputs, which is the one comparison that cannot fail. If the period has
 * no run, that is the answer: compute it first, through the product, as a person would.
 *
 * ## It reads, and it is allowed to
 *
 * Payroll is the 🔒 module: `assertPayrollAccess` gates the service on hr+owner and every read
 * is audited. This goes through the same scoped repo helpers with an owner context, because a
 * parallel run IS an owner reading their own payroll — and doing it through `withTenantRead`
 * rather than a raw connection means RLS is a wall here exactly as it is in a request.
 *
 * ## The output is evidence
 *
 * A markdown report and its JSON, written under `docs/parallel-runs/<period>/`, meant to be
 * committed. The explanations file is committed with them. Together they are what somebody
 * points at when asked whether the payroll was checked before three thousand people were paid
 * by it — which is a question that gets asked after something has gone wrong, by which time
 * "we ran it and it looked fine" is not an answer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { and, eq } from 'drizzle-orm'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { money } from '@/lib/money'
import { payrollLines, payrollRuns, workers } from '@/modules/workforce/schema'
import { companies } from '@/db/schema/core'
import {
  ParallelRunError,
  diffPayrollMonth,
  parseSheetCsv,
  renderReport,
  type ComputedRow,
  type Explanations,
} from '@/modules/workforce/parallel-run'

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
}

const USAGE = `
pnpm payroll:parallel-run --period=YYYY-MM --sheet=<file.csv> [options]

  --period          the month to check, e.g. 2026-07
  --sheet           the factory's own payroll export (CSV)
  --explanations    JSON: { "<employee_no>": "why this one differs" }
  --company         company uuid, when more than one has a payroll run
  --out             where the report goes (default docs/parallel-runs)

The sheet needs an employee number and a net column. Gross and total deductions are
optional and sharpen the report — a net that differs while gross agrees puts the fault
in deductions immediately.
`

async function main(): Promise<void> {
  const period = arg('period')
  const sheetPath = arg('sheet')

  if (!period || !sheetPath) {
    console.error(USAGE)
    process.exit(1)
  }

  if (!/^\d{4}-\d{2}$/.test(period)) {
    console.error(`[parallel-run] --period must be YYYY-MM, got "${period}"`)
    process.exit(1)
  }

  if (!existsSync(sheetPath)) {
    console.error(`[parallel-run] no sheet at ${sheetPath}`)
    process.exit(1)
  }

  let explanations: Explanations = {}
  const explanationsPath = arg('explanations')
  if (explanationsPath) {
    if (!existsSync(explanationsPath)) {
      console.error(`[parallel-run] no explanations file at ${explanationsPath}`)
      process.exit(1)
    }
    explanations = JSON.parse(readFileSync(explanationsPath, 'utf8')) as Explanations
  }

  const client = createDirectClient()
  const db = createDirectDb(client)

  try {
    const companyId = arg('company') ?? (await onlyCompanyWithARun(db, period))

    const [run] = await db
      .select({ id: payrollRuns.id, status: payrollRuns.status })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.period, period)))

    if (!run) {
      console.error(
        `[parallel-run] no payroll run for ${period}. Compute it first, through the product — ` +
          'this script checks a run that exists rather than making one, because a script that ' +
          'computed its own would be comparing the engine against itself.',
      )
      process.exit(1)
    }

    const lines = await db
      .select({
        employeeNo: workers.employeeNo,
        name: workers.name,
        net: payrollLines.net,
        gross: payrollLines.gross,
        totalDeductions: payrollLines.totalDeductions,
        currency: payrollLines.currency,
      })
      .from(payrollLines)
      .innerJoin(workers, eq(workers.id, payrollLines.workerId))
      .where(and(eq(payrollLines.companyId, companyId), eq(payrollLines.runId, run.id)))

    if (lines.length === 0) {
      console.error(`[parallel-run] the ${period} run has no lines. Compute it first.`)
      process.exit(1)
    }

    // Every line in a run carries the run's currency, so the first is the month's.
    const currency = lines[0]!.currency

    const computed: ComputedRow[] = lines.map((line) => ({
      employeeNo: line.employeeNo,
      name: line.name,
      net: money(line.net, currency),
      gross: money(line.gross, currency),
      totalDeductions: money(line.totalDeductions, currency),
    }))

    const sheet = parseSheetCsv(readFileSync(sheetPath, 'utf8'), currency)

    const report = diffPayrollMonth({ period, currency, sheet, computed, explanations })

    // ── Written before the exit code, always ────────────────────────────────
    //
    // A failing run is the one whose report matters. Writing it only on success would mean
    // the evidence exists exactly when nobody needs it.
    const outDir = join(arg('out') ?? join('docs', 'parallel-runs'), period)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'report.md'), renderReport(report))
    writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

    const { totals } = report
    console.log(
      `\n[parallel-run] ${period} · ${totals.workers} workers\n` +
        `  matched            ${totals.matched}\n` +
        `  explained          ${totals.explained}\n` +
        `  UNEXPLAINED        ${totals.unexplained}\n` +
        `  not in the run     ${totals.missingFromRun}\n` +
        `  not in the sheet   ${totals.missingFromSheet}\n` +
        `  absolute drift     ${totals.absoluteNetDrift.amount} ${currency}\n` +
        `\n  report: ${join(outDir, 'report.md')}`,
    )

    if (!report.passes) {
      console.error(
        `\n[parallel-run] FAILED. ${totals.unexplained} unexplained, ` +
          `${totals.missingFromRun + totals.missingFromSheet} on one side only.\n` +
          'Every row either reconciles to the paisa or gets a line in the explanations file. ' +
          'A missing worker never passes: that is a disagreement about who works here, not ' +
          'about money.',
      )
      process.exit(1)
    }

    console.log('\n[parallel-run] PASSED. Commit the report and the explanations beside it.')
  } finally {
    await client.end()
  }
}

/**
 * The company whose payroll this is.
 *
 * A dev database has several; a factory has one. Guessing the wrong one would diff a real
 * sheet against a seeded company's run and report every worker as missing, so this refuses
 * rather than picks when the answer is ambiguous.
 */
async function onlyCompanyWithARun(
  db: ReturnType<typeof createDirectDb>,
  period: string,
): Promise<string> {
  const rows = await db
    .selectDistinct({ companyId: payrollRuns.companyId })
    .from(payrollRuns)
    .innerJoin(companies, eq(companies.id, payrollRuns.companyId))
    .where(eq(payrollRuns.period, period))

  if (rows.length === 0) {
    throw new ParallelRunError(`no company has a payroll run for ${period}`)
  }
  if (rows.length > 1) {
    throw new ParallelRunError(
      `${rows.length} companies have a run for ${period}. Name one with --company=<uuid>:\n` +
        rows.map((row) => `  ${row.companyId}`).join('\n'),
    )
  }

  return rows[0]!.companyId
}

main().catch((error) => {
  console.error(`[parallel-run] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
