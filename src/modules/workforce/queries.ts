/**
 * Read models for Workforce & Payroll 🔒.
 *
 * This module has a different security posture from every other read layer in
 * the system, and the difference is deliberate:
 *
 *  - **Payroll reads go through `assertPayrollAccess`**, which throws a 403
 *    carrying nothing at all — no message key, no details, no hint that the
 *    thing refused is payroll. Telling a `member` "you need hr or owner"
 *    confirms the endpoint exists and names the role worth phishing.
 *  - **Reading wages is itself audited.** Who looked at whose pay, and when, is
 *    information worth keeping, so the line-level read is a transaction that
 *    writes an audit row.
 *
 * The roster below is NOT payroll — headcount and sections are ordinary
 * factory data — so it is readable without the gate. Anything carrying a
 * money figure is behind it.
 */
import { asc, desc, eq, isNull, sql } from 'drizzle-orm'

import type { AnyCtx, RequestCtx } from '@/modules/core/ctx'
import { scoped } from '@/modules/core/scoped'
import { withTenantRead } from '@/modules/core/tenancy'
import { lines } from '@/modules/planning/schema'

import { payrollRuns, wageGazettes, wageGrades, workers } from './schema'
import { assertPayrollAccess } from './service'

export interface RosterRow {
  id: string
  employeeNo: string
  name: string
  nameBn: string | null
  designation: string | null
  grade: string | null
  section: string | null
  lineCode: string | null
  status: string
  joinDate: string | null
}

/** Headcount and sections. No money, so no gate. */
export async function roster(ctx: AnyCtx, limit = 200): Promise<RosterRow[]> {
  return withTenantRead(ctx, (tx) =>
    tx
      .select({
        id: workers.id,
        employeeNo: workers.employeeNo,
        name: workers.name,
        nameBn: workers.nameBn,
        designation: workers.designation,
        grade: workers.grade,
        section: workers.section,
        lineCode: lines.code,
        status: workers.status,
        joinDate: workers.joinDate,
      })
      .from(workers)
      .leftJoin(lines, eq(lines.id, workers.lineId))
      .where(scoped(workers, ctx, isNull(workers.exitDate)))
      .orderBy(asc(workers.employeeNo))
      .limit(limit),
  )
}

export interface HeadcountRow {
  section: string
  active: number
  onLeave: number
}

export async function headcount(ctx: AnyCtx): Promise<HeadcountRow[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        section: sql<string>`coalesce(${workers.section}, 'unassigned')`,
        active: sql<number>`count(*) filter (where ${workers.status} = 'active')`.mapWith(Number),
        onLeave: sql<number>`count(*) filter (where ${workers.status} = 'on_leave')`.mapWith(Number),
      })
      .from(workers)
      .where(scoped(workers, ctx, isNull(workers.exitDate)))
      .groupBy(sql`coalesce(${workers.section}, 'unassigned')`)
      .orderBy(sql`coalesce(${workers.section}, 'unassigned')`)

    return rows
  })
}

export interface GradeRow {
  grade: string
  basic: string
  houseRent: string
  medical: string
  transport: string
  food: string
}

export interface GazetteView {
  id: string
  version: string
  effectiveFrom: string
  status: string
  notes: string | null
  grades: GradeRow[]
}

/**
 * The gazette in force 🔒.
 *
 * Behind the gate because a grade table IS wage data — publishing the basic for
 * every grade tells anybody what the factory pays, which is the thing payroll
 * access exists to control.
 */
export async function activeGazette(ctx: RequestCtx): Promise<GazetteView | null> {
  assertPayrollAccess(ctx)

  return withTenantRead(ctx, async (tx) => {
    const [gazette] = await tx
      .select()
      .from(wageGazettes)
      .where(scoped(wageGazettes, ctx, eq(wageGazettes.status, 'active')))
      .orderBy(desc(wageGazettes.effectiveFrom))
      .limit(1)

    if (!gazette) return null

    const grades = await tx
      .select({
        grade: wageGrades.grade,
        basic: wageGrades.basic,
        houseRent: wageGrades.houseRent,
        medical: wageGrades.medical,
        transport: wageGrades.transport,
        food: wageGrades.food,
      })
      .from(wageGrades)
      .where(scoped(wageGrades, ctx, eq(wageGrades.gazetteId, gazette.id)))
      .orderBy(asc(wageGrades.grade))

    return {
      id: gazette.id,
      version: gazette.version,
      effectiveFrom: gazette.effectiveFrom,
      status: gazette.status,
      notes: gazette.notes,
      grades,
    }
  })
}

export interface RunRow {
  id: string
  period: string
  status: string
  approvedAt: Date | null
  disbursedAt: Date | null
  lineCount: number
}

/** Payroll runs 🔒. Counts only — the figures need the line-level read. */
export async function payrollRunList(ctx: RequestCtx, limit = 12): Promise<RunRow[]> {
  assertPayrollAccess(ctx)

  const { payrollLines } = await import('./schema')

  return withTenantRead(ctx, (tx) =>
    tx
      .select({
        id: payrollRuns.id,
        period: payrollRuns.period,
        status: payrollRuns.status,
        approvedAt: payrollRuns.approvedAt,
        disbursedAt: payrollRuns.disbursedAt,
        lineCount: sql<number>`count(${payrollLines.id})`.mapWith(Number),
      })
      .from(payrollRuns)
      .leftJoin(payrollLines, eq(payrollLines.runId, payrollRuns.id))
      .groupBy(payrollRuns.id)
      .orderBy(desc(payrollRuns.period))
      .limit(limit),
  )
}

/** True when this caller may see wages at all. Used to choose the locked card. */
export function canSeePayroll(ctx: AnyCtx): boolean {
  try {
    assertPayrollAccess(ctx)
    return true
  } catch {
    return false
  }
}
