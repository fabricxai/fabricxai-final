/**
 * 10.2 integration.
 *
 * The pure rules are in `compliance.test.ts`. What is asserted here is the thing that would
 * actually cost a factory its buyer: a corrective action that LOOKS closed when nothing
 * happened.
 *
 *  - a CAP cannot close with no evidence — in the service AND at the database;
 *  - a critical finding cannot close on a note;
 *  - the person who submitted the evidence cannot be the one who accepts it;
 *  - only a role that may close, may close;
 *  - an approved findings batch emits per critical finding, immediately;
 *  - a findings batch cannot be attached to another company's audit;
 *  - the audit pack returns its own gaps, and there is no way to get one without them;
 *  - an OPEN critical CAP reaches the owner before its deadline, not after.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, outbox, pendingChanges, users } from '@/db/schema/core'
import '@/modules/compliance/register'
import {
  addCapEvidence,
  advanceCap,
  auditPack,
  capExceptions,
  certificateLadder,
  closeCap,
  openCap,
  recordAudit,
  upsertCertificate,
  type CompliancePolicy,
} from '@/modules/compliance/service'
import { audits, caps, certificates, findings } from '@/modules/compliance/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { approve, propose } from '@/modules/core/pending-changes'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const OFFICER = `cmp-${randomUUID().slice(0, 8)}`
const MANAGER = `mgr-${randomUUID().slice(0, 8)}`

const officerCtx: RequestCtx = { companyId: COMPANY, userId: OFFICER, roles: ['compliance'] }
const managerCtx: RequestCtx = { companyId: COMPANY, userId: MANAGER, roles: ['owner'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: OFFICER, roles: ['compliance'] }

const TODAY = '2026-03-10'

const POLICY: CompliancePolicy = {
  capDeadlineDays: { critical: 7, major: 30, minor: 60, observation: 90 },
  expiryRungs: [90, 60, 30],
  requiredCertificates: { rsc: ['fire', 'boiler'], bsci: [], sedex: [], buyer: [], government: [] },
  closerRoles: ['owner', 'admin'],
}

let auditId: string
let otherAuditId: string

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Comp Co', slug: `cmp-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values([
    { id: OFFICER, email: `${OFFICER}@fabricxai.test`, name: 'Officer' },
    { id: MANAGER, email: `${MANAGER}@fabricxai.test`, name: 'Manager' },
  ])

  const [foreign] = await db
    .insert(audits)
    .values({ companyId: OTHER, regime: 'rsc', auditor: 'RSC', auditedOn: '2026-03-01' })
    .returning({ id: audits.id })
  otherAuditId = foreign!.id
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, OFFICER))
  await db.delete(users).where(eq(users.id, MANAGER))
  await client.end()
})

beforeEach(async () => {
  await db.delete(pendingChanges).where(eq(pendingChanges.companyId, COMPANY))
  await db.delete(outbox).where(eq(outbox.companyId, COMPANY))
  await db.delete(caps).where(eq(caps.companyId, COMPANY))
  await db.delete(findings).where(eq(findings.companyId, COMPANY))
  await db.delete(certificates).where(eq(certificates.companyId, COMPANY))
  await db.delete(audits).where(eq(audits.companyId, COMPANY))

  const recorded = await recordAudit(officerCtx, {
    regime: 'rsc',
    auditor: 'RSC Bangladesh',
    auditedOn: '2026-03-01',
    reportDocumentId: undefined,
  })
  auditId = recorded.auditId
})

/** A findings batch as MARBIM would draft it from an audit report. */
const draftFindings = (over: Record<string, unknown> = {}) =>
  propose(officerCtx, {
    moduleId: 'compliance',
    targetTable: 'findings',
    operation: 'insert',
    zodSchemaKey: 'findings_batch_v1',
    payload: {
      auditId,
      findings: [
        {
          severity: 'critical',
          text: 'Emergency exit on the 3rd floor was locked during production hours.',
          sourcePage: 12,
          evidence: [{ page: 12, note: 'Photo 4' }],
        },
        {
          severity: 'minor',
          text: 'Chemical register not updated since January.',
          sourcePage: 31,
          evidence: [],
        },
      ],
      ...over,
    },
    fieldConfidence: { 'findings.0.severity': 0.93, 'findings.1.severity': 0.71 },
    source: 'ai_extraction',
    extractorVersion: 'audit-report@1.0.0',
  })

const findingOf = async (severity: string) => {
  const [row] = await db
    .select()
    .from(findings)
    .where(sql`${findings.companyId} = ${COMPANY} and ${findings.severity} = ${severity}`)
  return row!
}

describe('10.2 · an audit report becomes findings', () => {
  it('commits the batch and emits per CRITICAL finding immediately', async () => {
    const drafted = await draftFindings()
    await approve(managerCtx, { pendingChangeId: drafted.id })

    const rows = await db.select().from(findings).where(eq(findings.auditId, auditId))
    expect(rows).toHaveLength(2)
    // The page travels onto the row, so a reviewer can check a severity against the
    // paragraph it was read from.
    expect(rows.find((r) => r.severity === 'critical')!.sourcePage).toBe(12)

    const events = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventName, 'compliance.finding.critical'))
    // Fired on commit, not when somebody gets round to opening a CAP. The gap between those
    // two is exactly where a locked fire exit gets lost over a weekend.
    expect(events).toHaveLength(1)
  })

  it('REFUSES a batch aimed at another company’s audit', async () => {
    // Postgres runs FK checks with RLS bypassed, so the foreign key alone would take it and
    // this factory's findings would land on somebody else's audit.
    const drafted = await draftFindings({ auditId: otherAuditId })
    await expect(approve(managerCtx, { pendingChangeId: drafted.id })).rejects.toMatchObject({
      messageKey: 'compliance.errors.audit_not_found',
    })

    expect(await db.select().from(findings).where(eq(findings.companyId, COMPANY))).toHaveLength(0)
  })
})

describe('10.2 · a corrective action closes on evidence or not at all', () => {
  beforeEach(async () => {
    const drafted = await draftFindings()
    await approve(managerCtx, { pendingChangeId: drafted.id })
  })

  it('computes the deadline from the regime policy and the audit date', async () => {
    const finding = await findingOf('critical')
    const opened = await openCap(
      officerCtx,
      { findingId: finding.id, ownerUserId: OFFICER },
      POLICY,
    )
    // Seven days from the audit, because it is critical.
    expect(opened.deadline).toBe('2026-03-08')

    // Sixty days for a minor finding, from the same audit date — the severities are what
    // separate them, and the policy is what sets each one.
    const minor = await findingOf('minor')
    const minorCap = await openCap(
      officerCtx,
      { findingId: minor.id, ownerUserId: OFFICER },
      POLICY,
    )
    expect(minorCap.deadline).toBe('2026-04-30')
  })

  it('REFUSES to close with no evidence at all', async () => {
    const finding = await findingOf('minor')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)

    // A closed CAP with nothing behind it tells the next auditor it was dealt with.
    await expect(
      closeCap(managerCtx, { capId: opened.capId }, POLICY),
    ).rejects.toMatchObject({ messageKey: 'compliance.errors.invalid' })

    const [cap] = await db.select().from(caps).where(eq(caps.id, opened.capId))
    expect(cap!.status).not.toBe('closed')
  })

  it('the DATABASE refuses it too, not only the service', async () => {
    const finding = await findingOf('minor')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)

    // The one write that must not have a back door — asserted at the constraint itself,
    // because a service-layer-only guard is one raw UPDATE away from being bypassed.
    const refused = await db
      .update(caps)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(caps.id, opened.capId))
      .then(
        () => null,
        (error: { cause?: { constraint_name?: string } }) => error.cause?.constraint_name,
      )

    expect(refused).toBe('caps_closed_has_evidence')
  })

  it('REFUSES to close a CRITICAL finding on a note', async () => {
    const finding = await findingOf('critical')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)

    await addCapEvidence(officerCtx, { capId: opened.capId, note: 'Fixed it' })
    await advanceCap(officerCtx, { capId: opened.capId, status: 'evidence_submitted' })

    // "We fixed it" against a locked fire exit is a sentence, not evidence.
    await expect(
      closeCap(managerCtx, { capId: opened.capId }, POLICY),
    ).rejects.toMatchObject({ messageKey: 'compliance.errors.invalid' })
  })

  it('closes a critical finding on a document', async () => {
    const finding = await findingOf('critical')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)

    await addCapEvidence(officerCtx, {
      capId: opened.capId,
      documentId: randomUUID(),
      note: 'Photo of the exit with the padlock removed',
    })
    await advanceCap(officerCtx, { capId: opened.capId, status: 'evidence_submitted' })

    const closed = await closeCap(managerCtx, { capId: opened.capId }, POLICY)
    expect(closed.status).toBe('closed')

    const [cap] = await db.select().from(caps).where(eq(caps.id, opened.capId))
    expect(cap!.closedBy).toBe(MANAGER)
  })

  it('REFUSES self-certification — the submitter cannot be the closer', async () => {
    const finding = await findingOf('minor')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)

    await addCapEvidence(officerCtx, { capId: opened.capId, note: 'Register brought up to date' })
    await advanceCap(officerCtx, { capId: opened.capId, status: 'evidence_submitted' })

    // The officer holds a closer role in this fixture only through `compliance`, so give
    // them one that may close and check the SEPARATION still bites.
    const selfCtx: RequestCtx = { companyId: COMPANY, userId: OFFICER, roles: ['owner'] }
    await expect(closeCap(selfCtx, { capId: opened.capId }, POLICY)).rejects.toMatchObject({
      messageKey: 'compliance.errors.self_certification',
    })
  })

  it('REFUSES a closer without a role that may close', async () => {
    const finding = await findingOf('minor')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)
    await addCapEvidence(managerCtx, { capId: opened.capId, note: 'Done' })

    await expect(closeCap(officerCtx, { capId: opened.capId }, POLICY)).rejects.toMatchObject({
      messageKey: 'compliance.errors.not_a_closer',
    })
  })

  it('evidence cannot be added after closure', async () => {
    const finding = await findingOf('minor')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)
    await addCapEvidence(officerCtx, { capId: opened.capId, note: 'Register updated' })
    await closeCap(managerCtx, { capId: opened.capId }, POLICY)

    // It would change what a closed CAP claims without anybody re-accepting it.
    await expect(
      addCapEvidence(officerCtx, { capId: opened.capId, note: 'And another thing' }),
    ).rejects.toMatchObject({ messageKey: 'compliance.errors.cap_closed' })
  })

  it('closed is terminal', async () => {
    const finding = await findingOf('minor')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)
    await addCapEvidence(officerCtx, { capId: opened.capId, note: 'Register updated' })
    await closeCap(managerCtx, { capId: opened.capId }, POLICY)

    await expect(
      advanceCap(officerCtx, { capId: opened.capId, status: 'in_progress' }),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('10.2 · who hears about what', () => {
  beforeEach(async () => {
    const drafted = await draftFindings()
    await approve(managerCtx, { pendingChangeId: drafted.id })
  })

  it('an OPEN critical CAP reaches the owner before its deadline', async () => {
    const finding = await findingOf('critical')
    await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER, deadline: '2026-04-30' }, POLICY)

    const exceptions = await capExceptions(officerCtx, TODAY)
    // The deadline is when a locked fire exit must be FIXED by, not when the owner may
    // first be told about it.
    expect(exceptions[0]!.escalateTo).toBe('owner')
    expect(exceptions[0]!.severity).toBe('critical')
  })

  it('a minor CAP inside its deadline reaches nobody', async () => {
    const finding = await findingOf('minor')
    await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER, deadline: '2026-04-30' }, POLICY)

    const exceptions = await capExceptions(officerCtx, TODAY)
    expect(exceptions.map((e) => e.findingId)).not.toContain(finding.id)
  })

  it('evidence submitted past the deadline still escalates', async () => {
    const finding = await findingOf('minor')
    const opened = await openCap(
      officerCtx,
      { findingId: finding.id, ownerUserId: OFFICER, deadline: '2026-03-01' },
      POLICY,
    )
    await addCapEvidence(officerCtx, { capId: opened.capId, note: 'Register updated' })
    await advanceCap(officerCtx, { capId: opened.capId, status: 'evidence_submitted' })

    // Submitted is not closed. A CAP parked there past its deadline is exactly where these
    // things quietly stop moving.
    const exceptions = await capExceptions(officerCtx, TODAY)
    expect(exceptions.find((e) => e.capId === opened.capId)!.escalateTo).toBe('manager')
  })

  it('another company sees none of these exceptions', async () => {
    const finding = await findingOf('critical')
    await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)
    expect(await capExceptions(otherCtx, TODAY)).toEqual([])
  })
})

describe('10.2 · certificates', () => {
  it('puts what has lapsed above what is merely due', async () => {
    await upsertCertificate(officerCtx, { kind: 'fire', number: 'F-1', expiresOn: '2026-06-08' })
    await upsertCertificate(officerCtx, { kind: 'boiler', number: 'B-1', expiresOn: '2026-02-28' })
    await upsertCertificate(officerCtx, { kind: 'trade', number: 'T-1', expiresOn: null })

    const ladder = await certificateLadder(officerCtx, TODAY, POLICY)

    expect(ladder[0]!.kind).toBe('boiler')
    expect(ladder[0]!.state).toBe('expired')
    expect(ladder[1]!.kind).toBe('fire')
    expect(ladder[1]!.rung).toBe(90)
    // The one thing that never expires sorts last, not first.
    expect(ladder.at(-1)!.kind).toBe('trade')
  })

  it('another company’s certificates are invisible', async () => {
    await upsertCertificate(officerCtx, { kind: 'fire', number: 'F-1', expiresOn: '2026-06-08' })
    expect(await certificateLadder(otherCtx, TODAY, POLICY)).toEqual([])
  })
})

describe('10.2 · the audit pack reports its own gaps', () => {
  beforeEach(async () => {
    const drafted = await draftFindings()
    await approve(managerCtx, { pendingChangeId: drafted.id })
  })

  it('names the missing report, the uncovered findings and the absent certificates', async () => {
    const pack = await auditPack(officerCtx, { auditId, today: TODAY }, POLICY)

    const kinds = pack.gaps.map((gap) => gap.kind)
    // No report document was attached to this audit.
    expect(kinds).toContain('report_missing')
    // Neither finding has a corrective action yet.
    expect(pack.gaps.filter((gap) => gap.kind === 'finding_without_cap')).toHaveLength(2)
    // RSC requires a fire and a boiler certificate; neither exists.
    expect(pack.gaps.filter((gap) => gap.kind === 'certificate_missing')).toHaveLength(2)
  })

  it('names an expired required certificate rather than counting it as present', async () => {
    await upsertCertificate(officerCtx, { kind: 'fire', number: 'F-1', expiresOn: '2026-02-01' })
    await upsertCertificate(officerCtx, { kind: 'boiler', number: 'B-1', expiresOn: '2027-01-01' })

    const pack = await auditPack(officerCtx, { auditId, today: TODAY }, POLICY)
    expect(pack.gaps).toContainEqual({ kind: 'certificate_expired', ref: 'fire' })
    expect(pack.gaps.map((g) => g.ref)).not.toContain('boiler')
  })

  it('names an open CAP instead of exporting around it', async () => {
    const finding = await findingOf('critical')
    const opened = await openCap(officerCtx, { findingId: finding.id, ownerUserId: OFFICER }, POLICY)

    const pack = await auditPack(officerCtx, { auditId, today: TODAY }, POLICY)
    expect(pack.gaps).toContainEqual({ kind: 'cap_open', ref: opened.capId })
  })

  it('a pack for another company’s audit is refused, not returned empty', async () => {
    await expect(
      auditPack(otherCtx, { auditId, today: TODAY }, POLICY),
    ).rejects.toMatchObject({ messageKey: 'compliance.errors.audit_not_found' })
  })
})
