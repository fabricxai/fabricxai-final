/**
 * 10.1 integration ⚖ 🔒
 *
 * Three things this proves that the pure vectors cannot:
 *
 *  - the 🔒 lockout is real, and its refusal carries NO body (PLAYBOOK §3);
 *  - a factory's own uploaded gazette drives the figures, and a run pins the version it
 *    used so a later revision cannot rewrite what was already paid;
 *  - reads of `payroll_lines` are audited.
 *
 * The gazette figures below are, again, a FIXTURE — invented to make arithmetic visible.
 * The point is that they came from an upload rather than from the codebase.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { auditLog, companies, users } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import { AppError } from '@/modules/core/errors'
import {
  activateGazette,
  approvePayrollRun,
  computePayrollRun,
  getActiveGazette,
  getPayrollLines,
  uploadGazette,
} from '@/modules/workforce/service'
import { attendance, payrollLines, payrollRuns, wageGazettes, workers } from '@/modules/workforce/schema'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const HR = `hr-${randomUUID().slice(0, 8)}`
const OWNER = `owner-${randomUUID().slice(0, 8)}`
const CLERK = `clerk-${randomUUID().slice(0, 8)}`

const hrCtx: RequestCtx = { companyId: COMPANY, userId: HR, roles: ['hr'] }
const ownerCtx: RequestCtx = { companyId: COMPANY, userId: OWNER, roles: ['owner', 'hr'] }
/** A `member` — the role PLAYBOOK §3 names explicitly. */
const clerkCtx: RequestCtx = { companyId: COMPANY, userId: CLERK, roles: ['member'] }

const PERIOD = '2026-06'
let workerId: string

/** FIXTURE gazette — not the real Bangladesh wage board table. */
const GAZETTE_V1 = {
  version: 'fixture-2023',
  effectiveFrom: '2023-12-01',
  grades: [
    { grade: '7', basic: '5000.00', houseRent: '2500.00', medical: '750.00', transport: '450.00', food: '1250.00' },
    { grade: '4', basic: '8000.00', houseRent: '4000.00', medical: '750.00', transport: '450.00', food: '1250.00' },
  ],
}

beforeAll(async () => {
  await db.insert(companies).values({ id: COMPANY, name: 'Wage Co', slug: `wage-${COMPANY.slice(0, 8)}` })
  await db.insert(users).values([
    { id: HR, email: `${HR}@fabricxai.test`, name: 'HR Officer' },
    { id: OWNER, email: `${OWNER}@fabricxai.test`, name: 'Owner' },
    { id: CLERK, email: `${CLERK}@fabricxai.test`, name: 'Store Clerk' },
  ])

  const [worker] = await db
    .insert(workers)
    .values({
      companyId: COMPANY,
      employeeNo: 'EMP-0001',
      name: 'Shirin Akter',
      nameBn: 'শিরীন আক্তার',
      grade: '7',
      joinDate: '2024-03-01',
      createdBy: HR,
    })
    .returning({ id: workers.id })
  workerId = worker!.id

  // 26 present days, 10 hours of overtime in total.
  const rows = Array.from({ length: 26 }, (_, i) => ({
    companyId: COMPANY,
    workerId,
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    status: 'present' as const,
    source: 'device' as const,
    otHours: i < 4 ? '2.50' : '0',
  }))
  await db.insert(attendance).values(rows)
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id = ${COMPANY}`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  for (const id of [HR, OWNER, CLERK]) await db.delete(users).where(eq(users.id, id))
  await client.end()
})

describe('10.1 🔒 · the lockout', () => {
  it('a member gets 403 from every payroll entry point', async () => {
    const attempts = [
      () => uploadGazette(clerkCtx, GAZETTE_V1),
      () => activateGazette(clerkCtx, randomUUID()),
      () => computePayrollRun(clerkCtx, { period: PERIOD }),
      () => getPayrollLines(clerkCtx, randomUUID()),
      () => getActiveGazette(clerkCtx, PERIOD),
      () => approvePayrollRun(clerkCtx, randomUUID()),
    ]

    for (const attempt of attempts) {
      const thrown = await attempt().catch((e: unknown) => e)
      expect(thrown).toBeInstanceOf(AppError)
      expect((thrown as AppError).status).toBe(403)
    }
  })

  it('and the refusal carries NO body — no message key, no details', async () => {
    // The requirement PLAYBOOK §3 names. A 403 saying "you need hr or owner" confirms the
    // endpoint exists and names the role worth phishing; a 403 mentioning payroll_lines
    // confirms the table. This one says nothing at all.
    const thrown = (await getPayrollLines(clerkCtx, randomUUID()).catch(
      (e: unknown) => e,
    )) as AppError

    expect(thrown.status).toBe(403)
    expect(thrown.messageKey).toBe('')
    expect(thrown.details).toEqual({})
    expect(JSON.stringify(thrown.toJSON())).not.toMatch(/payroll|wage|hr|owner/i)
  })
})

describe('10.1 · the gazette is uploaded, not hardcoded', () => {
  let gazetteId: string

  it('accepts a factory’s own gazette and lands it as draft', async () => {
    const result = await uploadGazette(hrCtx, GAZETTE_V1)
    gazetteId = result.gazetteId
    expect(result.grades).toBe(2)

    const [row] = await db.select().from(wageGazettes).where(eq(wageGazettes.id, gazetteId))
    // Transcribing a government notification needs a second pair of eyes before anyone
    // is paid on it.
    expect(row?.status).toBe('draft')
  })

  it('refuses to run payroll before a gazette is activated', async () => {
    await expect(computePayrollRun(hrCtx, { period: PERIOD })).rejects.toMatchObject({
      messageKey: 'workforce.errors.no_active_gazette',
    })
  })

  it('refuses to activate a gazette with no grades', async () => {
    const empty = await db
      .insert(wageGazettes)
      .values({ companyId: COMPANY, version: 'empty', effectiveFrom: '2024-01-01', createdBy: HR })
      .returning({ id: wageGazettes.id })

    await expect(activateGazette(hrCtx, empty[0]!.id)).rejects.toMatchObject({
      messageKey: 'workforce.errors.gazette_has_no_grades',
    })
  })

  it('activates it, and payroll then computes from those uploaded figures', async () => {
    await activateGazette(hrCtx, gazetteId)

    const active = await getActiveGazette(hrCtx, PERIOD)
    expect(active.version).toBe('fixture-2023')

    const run = await computePayrollRun(hrCtx, { period: PERIOD })
    expect(run.lines).toBe(1)

    const [line] = await db.select().from(payrollLines).where(eq(payrollLines.runId, run.runId))

    // Straight from the uploaded grade '7'.
    expect(line?.components).toMatchObject({ basic: '5000.00', houseRent: '2500.00' })
    // 10 hours OT: 5000 × 2 × 10 / 208 = 480.769… → 480.77
    expect(line?.otAmount).toBe('480.77')
    expect(line?.gross).toBe('10430.77')
  })

  it('a later gazette supersedes the old one WITHOUT changing what was already computed', async () => {
    const v2 = await uploadGazette(hrCtx, {
      version: 'fixture-2026-revision',
      effectiveFrom: '2026-07-01',
      grades: [
        { grade: '7', basic: '9000.00', houseRent: '4500.00', medical: '1000.00', transport: '600.00', food: '1500.00' },
      ],
    })
    await activateGazette(hrCtx, v2.gazetteId)

    // June's run still points at the gazette it was computed against.
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.period, PERIOD))
    expect(run?.gazetteId).toBe(gazetteId)

    const [line] = await db.select().from(payrollLines).where(eq(payrollLines.runId, run!.id))
    // A wage revision effective in July does not retroactively change June's payslip.
    expect(line?.components).toMatchObject({ basic: '5000.00' })
  })
})

describe('10.1 · run lifecycle', () => {
  it('recomputing replaces the lines rather than creating a second run', async () => {
    const before = await db.select().from(payrollRuns).where(eq(payrollRuns.period, PERIOD))

    const again = await computePayrollRun(hrCtx, { period: PERIOD })
    const after = await db.select().from(payrollRuns).where(eq(payrollRuns.period, PERIOD))

    expect(after).toHaveLength(before.length)
    const lines = await db.select().from(payrollLines).where(eq(payrollLines.runId, again.runId))
    expect(lines).toHaveLength(1)
  })

  it('hr computes but only the owner approves', async () => {
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.period, PERIOD))

    // Computing is HR's job; signing off what people are paid is the owner's.
    await expect(approvePayrollRun(hrCtx, run!.id)).rejects.toMatchObject({ status: 403 })

    const result = await approvePayrollRun(ownerCtx, run!.id)
    expect(result).toEqual({ from: 'computed', to: 'approved' })
  })

  it('an approved run cannot be recomputed — a paid figure is not rewritten', async () => {
    await expect(computePayrollRun(ownerCtx, { period: PERIOD })).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'workforce.errors.run_not_recomputable',
    })
  })
})

describe('10.1 · reads are audited', () => {
  it('records who looked at whose wages', async () => {
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.period, PERIOD))

    await getPayrollLines(ownerCtx, run!.id)

    const reads = await db
      .select()
      .from(auditLog)
      .where(sql`${auditLog.companyId} = ${COMPANY} and ${auditLog.action} = 'read'`)

    expect(reads.length).toBeGreaterThan(0)
    expect(reads.some((r) => r.targetTable === 'payroll_lines' && r.actorUserId === OWNER)).toBe(true)
  })
})
