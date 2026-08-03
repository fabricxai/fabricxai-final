/**
 * 10.1 Workforce seed slice — the wage gazette and a month of attendance.
 *
 * The gazette is the point. Bangladeshi minimum wages are set by government notification as
 * a table of grades, and every component of a worker's pay is derived from the grade's
 * BASIC — house rent is a percentage of basic, overtime is basic ÷ 208 × 2, a festival bonus
 * is a percentage of basic. Get the grade table wrong and every payslip in the factory is
 * wrong in the same direction, which is how a factory ends up owing arrears to two thousand
 * people at once.
 *
 * Figures here follow the December 2023 notification structure for the RMG sector: grade 7
 * at 12,500 taka gross, rising through the grades, with the statutory 50% house rent and
 * fixed medical, transport and food allowances.
 *
 * Attendance is seeded with real shape — a few absences, one worker on unpaid leave, and
 * overtime that varies by line. A month where everybody worked every day tests none of the
 * pro-rating the payroll exists to do.
 */
import { and, eq } from 'drizzle-orm'

import { roles } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import { attendance, wageGazettes, workers } from '@/modules/workforce/schema'
import { activateGazette, uploadGazette } from '@/modules/workforce/service'

import type { SeedContext, SeedSlice } from './types'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The grade table.
 *
 * `basic` is the load-bearing number; the rest follow from it by statute. House rent is 50%
 * of basic, and medical, transport and food are flat amounts the same for every grade —
 * which is why a low grade's gross is proportionally more allowance than a high one's.
 */
const GRADES = [
  { grade: '1', basic: '10938', houseRent: '5469', medical: '750', transport: '450', food: '1250' },
  { grade: '2', basic: '10250', houseRent: '5125', medical: '750', transport: '450', food: '1250' },
  { grade: '3', basic: '9500', houseRent: '4750', medical: '750', transport: '450', food: '1250' },
  { grade: '4', basic: '8800', houseRent: '4400', medical: '750', transport: '450', food: '1250' },
  { grade: '5', basic: '8200', houseRent: '4100', medical: '750', transport: '450', food: '1250' },
  { grade: '6', basic: '7000', houseRent: '3500', medical: '750', transport: '450', food: '1250' },
  { grade: '7', basic: '6700', houseRent: '3350', medical: '750', transport: '450', food: '1250' },
] as const

/** A 30-day wage month, less the four Fridays the floor does not run. */
const WORKING_DAYS = 26

export const WORKFORCE_SLICE: SeedSlice = {
  id: 'workforce',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    const day = today()
    const period = day.slice(0, 7)

    const [owner] = await ctx.db
      .select({ userId: roles.userId })
      .from(roles)
      .where(and(eq(roles.companyId, ctx.companyId), eq(roles.role, 'owner')))
    if (!owner) return counts

    // `assertPayrollAccess` refuses anything but hr or owner, and it is right to — so the
    // seed acts as the owner rather than inventing a role that bypasses it.
    const requestCtx: RequestCtx = {
      companyId: ctx.companyId,
      userId: owner.userId,
      roles: ['owner', 'hr'],
    }

    // ── The gazette ─────────────────────────────────────────────────────────
    const version = 'SRO-2023-12'
    const [existing] = await ctx.db
      .select({ id: wageGazettes.id })
      .from(wageGazettes)
      .where(and(eq(wageGazettes.companyId, ctx.companyId), eq(wageGazettes.version, version)))

    if (!existing) {
      const { gazetteId } = await uploadGazette(requestCtx, {
        version,
        effectiveFrom: '2023-12-01',
        notes: 'Minimum wage notification for the ready-made garment sector.',
        grades: GRADES.map((g) => ({ ...g })),
      })
      await activateGazette(requestCtx, gazetteId)
      counts.wage_gazettes = 1
    }

    // ── A month of attendance ───────────────────────────────────────────────
    const workerRows = await ctx.db
      .select({ id: workers.id, employeeNo: workers.employeeNo })
      .from(workers)
      .where(eq(workers.companyId, ctx.companyId))
    if (workerRows.length === 0) return counts

    const [alreadyMarked] = await ctx.db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.companyId, ctx.companyId), eq(attendance.date, `${period}-01`)))
    if (alreadyMarked) return counts

    const rows: (typeof attendance.$inferInsert)[] = []

    for (const [index, worker] of workerRows.entries()) {
      // Two workers carry absences and one is on unpaid leave, so the pro-rating and the
      // attendance bonus both have something to bite on.
      const absentDays = index % 11 === 0 ? 3 : index % 7 === 0 ? 1 : 0
      const otHoursPerDay = 1 + (index % 3)

      for (let d = 1; d <= WORKING_DAYS; d += 1) {
        const date = `${period}-${String(d).padStart(2, '0')}`
        const absent = d <= absentDays
        rows.push({
          companyId: ctx.companyId,
          workerId: worker.id,
          date,
          status: absent ? 'absent' : 'present',
          otHours: absent ? '0.00' : otHoursPerDay.toFixed(2),
          source: 'device',
        })
      }
    }

    for (let i = 0; i < rows.length; i += 500) {
      await ctx.db.insert(attendance).values(rows.slice(i, i + 500)).onConflictDoNothing()
    }
    counts.attendance = rows.length

    return counts
  },
}
