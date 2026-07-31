/**
 * The newly-scheduled jobs, against a real database.
 *
 * A cron that compiles is not a cron that helps. What is asserted here is the property that
 * decides whether these alerts get read or muted: each one fires ONCE per real change of
 * state, not once per night for as long as the condition lasts.
 *
 * That is the whole difference between an alert and noise, and it is invisible in a single
 * run — every test below runs its job twice.
 *
 * Also asserted: the two jobs that call a model do NOTHING when no provider is registered.
 * Running anyway would walk the backlog and mark every queued extraction permanently
 * rejected, which is worse than not running at all.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, notifications, users } from '@/db/schema/core'
import '@/modules/compliance/register'
import { runCapEscalations, runCertificateAlerts } from '@/modules/compliance/jobs'
import { audits, caps, certificates, findings } from '@/modules/compliance/schema'
import type { CompliancePolicy } from '@/modules/compliance/service'
import { upsertCertificate } from '@/modules/compliance/service'
import type { SystemCtx } from '@/modules/core/ctx'
import '@/modules/maintenance/register'
import {
  previousMonthStart,
  runDowntimeCosts,
  runLowStockAlerts,
  runPmDueAlerts,
  type StoredMaintenancePolicy,
} from '@/modules/maintenance/jobs'
import { machines, pmSchedules, spareParts } from '@/modules/maintenance/schema'
import { completePm, registerMachine } from '@/modules/maintenance/service'
import { runQueuedExtractions } from '@/modules/marbim/jobs'
import { resetProvider } from '@/modules/marbim/provider'
import '@/modules/marbim/register'
import { extractionJobs } from '@/modules/marbim/schema'
import { queueExtraction } from '@/modules/marbim/service'
import { runStyleEmbedSweep } from '@/modules/memory/jobs'
import { styleFingerprints } from '@/modules/memory/schema'
import '@/modules/rfq/register'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const USER = `job-${randomUUID().slice(0, 8)}`
const ctx: SystemCtx = { companyId: COMPANY, userId: null, roles: ['owner'], system: true }

const TODAY = '2026-03-10'

const COMPLIANCE: CompliancePolicy = {
  capDeadlineDays: { critical: 7, major: 30, minor: 60, observation: 90 },
  expiryRungs: [90, 60, 30],
  requiredCertificates: { rsc: ['fire'], bsci: [], sedex: [], buyer: [], government: [] },
  closerRoles: ['owner', 'admin'],
}

const MAINTENANCE: StoredMaintenancePolicy = {
  minFleetTickets: 10,
  outlierMultiple: 3,
  outlierMinTickets: 5,
}

beforeAll(async () => {
  await db
    .insert(companies)
    .values({ id: COMPANY, name: 'Job Co', slug: `job-${COMPANY.slice(0, 8)}` })
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Job' })
})

afterAll(async () => {
  resetProvider()
  await db.execute(sql`delete from audit_log where company_id = ${COMPANY}`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

beforeEach(async () => {
  await db.delete(notifications).where(eq(notifications.companyId, COMPANY))
  await db.delete(certificates).where(eq(certificates.companyId, COMPANY))
  await db.delete(caps).where(eq(caps.companyId, COMPANY))
  await db.delete(findings).where(eq(findings.companyId, COMPANY))
  await db.delete(audits).where(eq(audits.companyId, COMPANY))
  await db.delete(pmSchedules).where(eq(pmSchedules.companyId, COMPANY))
  await db.delete(machines).where(eq(machines.companyId, COMPANY))
  await db.delete(spareParts).where(eq(spareParts.companyId, COMPANY))
  await db.delete(extractionJobs).where(eq(extractionJobs.companyId, COMPANY))
  await db.delete(styleFingerprints).where(eq(styleFingerprints.companyId, COMPANY))
})

const notificationsOfKind = (kind: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.companyId, COMPANY), eq(notifications.kind, kind)))

describe('10.2 · certificate alerts fire once per rung', () => {
  it('alerts at 90 days and does NOT alert again the next night', async () => {
    // 2026-06-08 is exactly 90 days after 2026-03-10.
    await upsertCertificate({ ...ctx, userId: USER } as never, {
      kind: 'fire',
      number: 'F-1',
      expiresOn: '2026-06-08',
    })

    await runCertificateAlerts(ctx, { today: TODAY }, COMPLIANCE)
    await runCertificateAlerts(ctx, { today: '2026-03-11' }, COMPLIANCE)

    // An alert that repeats every night is the mechanism by which people learn to ignore
    // compliance alerts — and the one that finally matters looks exactly like the other 89.
    expect(await notificationsOfKind('compliance.certificate.expiring')).toHaveLength(1)
  })

  it('alerts AGAIN when the next rung is crossed', async () => {
    await upsertCertificate({ ...ctx, userId: USER } as never, {
      kind: 'fire',
      number: 'F-1',
      expiresOn: '2026-06-08',
    })

    await runCertificateAlerts(ctx, { today: TODAY }, COMPLIANCE)
    // Thirty days later the certificate is 60 days out — a new rung, a new alert.
    await runCertificateAlerts(ctx, { today: '2026-04-09' }, COMPLIANCE)

    const alerts = await notificationsOfKind('compliance.certificate.expiring')
    expect(alerts).toHaveLength(2)
    expect(alerts.map((a) => (a.params as { rung: number }).rung).sort()).toEqual([60, 90])
  })

  it('treats an EXPIRED certificate as its own alert, at critical, once', async () => {
    await upsertCertificate({ ...ctx, userId: USER } as never, {
      kind: 'boiler',
      number: 'B-1',
      expiresOn: '2026-02-28',
    })

    await runCertificateAlerts(ctx, { today: TODAY }, COMPLIANCE)
    await runCertificateAlerts(ctx, { today: '2026-03-11' }, COMPLIANCE)

    const expired = await notificationsOfKind('compliance.certificate.expired')
    expect(expired).toHaveLength(1)
    // A licence expiring in thirty days is a task; one that lapsed is a factory operating
    // without it.
    expect(expired[0]!.severity).toBe('critical')
    expect(await notificationsOfKind('compliance.certificate.expiring')).toHaveLength(0)
  })

  it('says nothing about a certificate that is comfortably valid', async () => {
    await upsertCertificate({ ...ctx, userId: USER } as never, {
      kind: 'trade',
      number: 'T-1',
      expiresOn: '2028-01-01',
    })

    const result = await runCertificateAlerts(ctx, { today: TODAY }, COMPLIANCE)
    expect(result.alerted).toBe(0)
  })
})

describe('10.2 · CAP escalations fire once per level', () => {
  const openCriticalCap = async (deadline: string) => {
    const [audit] = await db
      .insert(audits)
      .values({ companyId: COMPANY, regime: 'rsc', auditor: 'RSC', auditedOn: '2026-03-01' })
      .returning({ id: audits.id })

    const [finding] = await db
      .insert(findings)
      .values({
        companyId: COMPANY,
        auditId: audit!.id,
        severity: 'critical',
        text: 'Emergency exit locked',
      })
      .returning({ id: findings.id })

    const [cap] = await db
      .insert(caps)
      .values({
        companyId: COMPANY,
        findingId: finding!.id,
        ownerUserId: USER,
        deadline,
        status: 'open',
      })
      .returning({ id: caps.id })

    return cap!.id
  }

  it('reaches the owner once, not every morning until it is closed', async () => {
    await openCriticalCap('2026-04-30')

    await runCapEscalations(ctx, { today: TODAY })
    await runCapEscalations(ctx, { today: '2026-03-11' })
    await runCapEscalations(ctx, { today: '2026-03-12' })

    const alerts = await notificationsOfKind('compliance.cap.escalated')
    expect(alerts).toHaveLength(1)
    // An OPEN critical finding reaches the owner BEFORE its deadline: the deadline is when
    // a locked fire exit must be fixed by, not when the owner may first be told.
    expect(alerts[0]!.role).toBe('owner')
  })

  it('alerts again when a major CAP crosses from inside its deadline to overdue', async () => {
    const [audit] = await db
      .insert(audits)
      .values({ companyId: COMPANY, regime: 'bsci', auditor: 'BSCI', auditedOn: '2026-03-01' })
      .returning({ id: audits.id })
    const [finding] = await db
      .insert(findings)
      .values({ companyId: COMPANY, auditId: audit!.id, severity: 'major', text: 'Register gap' })
      .returning({ id: findings.id })
    await db.insert(caps).values({
      companyId: COMPANY,
      findingId: finding!.id,
      ownerUserId: USER,
      deadline: '2026-03-15',
      status: 'open',
    })

    // Inside its deadline — nobody needs to hear about it yet.
    await runCapEscalations(ctx, { today: TODAY })
    expect(await notificationsOfKind('compliance.cap.escalated')).toHaveLength(0)

    // Overdue.
    await runCapEscalations(ctx, { today: '2026-03-20' })
    await runCapEscalations(ctx, { today: '2026-03-21' })

    const alerts = await notificationsOfKind('compliance.cap.escalated')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.role).toBe('admin')
  })
})

describe('9.1 · PM due alerts fire once per due date', () => {
  let machineId: string
  let scheduleId: string

  beforeEach(async () => {
    const registered = await registerMachine({ ...ctx, userId: USER } as never, {
      machineType: 'overlock',
    })
    machineId = registered.machineId

    const [schedule] = await db
      .insert(pmSchedules)
      .values({
        companyId: COMPANY,
        machineType: 'overlock',
        cadence: 'monthly',
        checklist: [{ step: 'Clean lint from hook area' }],
      })
      .returning({ id: pmSchedules.id })
    scheduleId = schedule!.id
    expect(scheduleId).toBeTruthy()
  })

  it('a NEVER-serviced machine alerts once, not every night forever', async () => {
    // Its due date is "today", which moves. Keyed on the date, this machine would send an
    // identical notification every single night for the life of the factory.
    await runPmDueAlerts(ctx, { today: TODAY })
    await runPmDueAlerts(ctx, { today: '2026-03-11' })
    await runPmDueAlerts(ctx, { today: '2026-03-12' })

    const alerts = await notificationsOfKind('maintenance.pm.due')
    expect(alerts).toHaveLength(1)
    expect((alerts[0]!.params as { neverServiced: boolean }).neverServiced).toBe(true)
    expect(alerts[0]!.entityId).toBe(machineId)
  })

  it('a serviced machine alerts once per cycle, and again on the next one', async () => {
    await completePm({ ...ctx, userId: USER } as never, {
      scheduleId,
      machineId,
      completedOn: '2026-02-10',
      checked: [{ step: 'Clean lint from hook area', ok: true }],
    })

    // Due 2026-03-10, on a monthly cadence.
    await runPmDueAlerts(ctx, { today: TODAY })
    await runPmDueAlerts(ctx, { today: '2026-03-15' })
    expect(await notificationsOfKind('maintenance.pm.due')).toHaveLength(1)

    // Serviced late, so the next one falls due a month after that.
    await completePm({ ...ctx, userId: USER } as never, {
      scheduleId,
      machineId,
      completedOn: '2026-03-15',
      checked: [{ step: 'Clean lint from hook area', ok: true }],
    })

    await runPmDueAlerts(ctx, { today: '2026-04-15' })
    expect(await notificationsOfKind('maintenance.pm.due')).toHaveLength(2)
  })
})

describe('9.1 · low stock and the missing rate', () => {
  it('alerts on a part below its minimum, once per level it drops to', async () => {
    const [part] = await db
      .insert(spareParts)
      .values({ companyId: COMPANY, code: 'LOOPER', name: 'Looper', onHand: 3, minLevel: 5 })
      .returning({ id: spareParts.id })

    await runLowStockAlerts(ctx)
    await runLowStockAlerts(ctx)
    expect(await notificationsOfKind('maintenance.parts.low')).toHaveLength(1)

    // It got worse. That IS worth saying again.
    await db.update(spareParts).set({ onHand: 0 }).where(eq(spareParts.id, part!.id))
    await runLowStockAlerts(ctx)

    const alerts = await notificationsOfKind('maintenance.parts.low')
    expect(alerts).toHaveLength(2)
    expect(alerts.some((a) => a.severity === 'critical')).toBe(true)
  })

  it('REPORTS that no downtime cost could be produced, rather than writing zeroes', async () => {
    const result = await runDowntimeCosts(ctx, { today: TODAY }, MAINTENANCE)

    expect(result.skipped).toMatch(/rate/)
    expect(result.month).toBe(previousMonthStart(TODAY))

    // "0 BDT lost this month" reads as an answer and closes the question. Nobody would go
    // looking for a setting they were never told was missing.
    const told = await notificationsOfKind('maintenance.downtime_cost.no_rate')
    expect(told).toHaveLength(1)
    expect(told[0]!.href).toBe('/settings/maintenance')

    // And it says it once a month, not once a night.
    await runDowntimeCosts(ctx, { today: '2026-03-11' }, MAINTENANCE)
    expect(await notificationsOfKind('maintenance.downtime_cost.no_rate')).toHaveLength(1)
  })
})

describe('the model-dependent jobs do nothing without a provider', () => {
  beforeEach(() => {
    resetProvider()
  })

  it('the extraction runner does NOT reject the backlog it cannot process', async () => {
    const queued = await queueExtraction(
      { ...ctx, userId: USER } as never,
      {
        moduleId: 'rfq',
        targetTable: 'rfqs',
        zodSchemaKey: 'rfq',
        extractorName: 'enquiry-email',
        extractorVersion: '1.0.0',
        sourceText: 'quantity: 12,000 pcs',
      },
      { extractionsPerHour: 20, maxAttempts: 3 },
    )

    const result = await runQueuedExtractions(ctx, { extractionsPerHour: 20, maxAttempts: 3 })

    expect(result.skipped).toMatch(/provider/)
    expect(result.picked).toBe(0)

    const [job] = await db.select().from(extractionJobs).where(eq(extractionJobs.id, queued.jobId))
    // Still queued. `rejected` is terminal, so a runner that processed the backlog with no
    // provider would destroy every extraction a factory uploaded before anybody set up a key.
    expect(job!.status).toBe('queued')
    expect(job!.attempts).toBe(0)
  })

  it('the style sweep skips rather than failing every style', async () => {
    const result = await runStyleEmbedSweep(ctx)
    expect(result.skipped).toMatch(/provider/)
    expect(result.embedded).toBe(0)
  })

  it('both run normally once a provider is registered', async () => {
    const { mockProvider } = await import('@/modules/marbim/mock-provider')
    const { registerProvider } = await import('@/modules/marbim/provider')
    registerProvider(mockProvider)

    const sweep = await runStyleEmbedSweep(ctx)
    expect(sweep.skipped).toBeUndefined()

    const extractions = await runQueuedExtractions(ctx, {
      extractionsPerHour: 20,
      maxAttempts: 3,
    })
    expect(extractions.skipped).toBeUndefined()
  })
})
