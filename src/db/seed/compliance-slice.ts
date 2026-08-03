/**
 * 10.2 Compliance seed slice.
 *
 * Compliance screens are only useful when something is wrong, and wrong in the specific
 * ways that matter to a garment factory:
 *
 *  - **The certificate ladder needs a spread.** One licence lapsed, one inside 30 days, one
 *    inside 60, one comfortable. A ladder where everything is valid teaches nobody what the
 *    countdown is for, and a factory operating on a lapsed fire licence is a factory that
 *    stops when an inspector notices.
 *  - **One finding is critical.** A critical finding cannot be closed on a note — the
 *    service demands a document — and that refusal is the single most important behaviour
 *    on the screen. Seeding only minor findings would hide it.
 *  - **One CAP is past its deadline.** Overdue is the state the escalation job exists for.
 *
 * Findings are inserted directly rather than through `commitFindingsBatch`, which is the
 * approve-side of a MARBIM extraction from an audit PDF. The seed has no PDF and no
 * extractor, and faking field confidence to get through that path would defeat the check
 * the pending flow exists for.
 */
import { and, eq } from 'drizzle-orm'

import { roles } from '@/db/schema/core'
import { audits, caps, certificates, findings, trainings } from '@/modules/compliance/schema'
import { recordAudit, recordTraining, upsertCertificate } from '@/modules/compliance/service'
import type { RequestCtx } from '@/modules/core/ctx'

import type { SeedContext, SeedSlice } from './types'

const today = () => new Date().toISOString().slice(0, 10)

function daysFrom(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** The licences a Bangladeshi garment factory actually has to hold. */
const CERTIFICATES = [
  // Lapsed. `expired` is its own state on the ladder, not "0 days remaining".
  { kind: 'Fire licence', number: 'FSCD/DHK/2024/8841', expiresInDays: -12 },
  { kind: 'Factory licence', number: 'DIFE/GAZ/2023/1177', expiresInDays: 24 },
  { kind: 'Boiler certificate', number: 'BOI/2025/0442', expiresInDays: 51 },
  { kind: 'Environmental clearance', number: 'DOE/GAZ/2025/2290', expiresInDays: 86 },
  { kind: 'Trade licence', number: 'GCC/TL/2026/6613', expiresInDays: 240 },
] as const

const FINDINGS = [
  {
    severity: 'critical' as const,
    text: 'Emergency exit on the second floor was chained during the shift.',
    capDaysFromNow: -4,
  },
  {
    severity: 'major' as const,
    text: 'Chemical store not locked; MSDS sheets missing for two solvents.',
    capDaysFromNow: 11,
  },
  {
    severity: 'minor' as const,
    text: 'First-aid box on line 4 short of the required contents.',
    capDaysFromNow: 26,
  },
  {
    severity: 'observation' as const,
    text: 'Drinking-water points clean but unlabelled in Bangla.',
    capDaysFromNow: 40,
  },
] as const

const TRAININGS = [
  { kind: 'Fire drill', daysAgo: 74, attendeesCount: 1180 },
  { kind: 'Chemical handling', daysAgo: 130, attendeesCount: 46 },
  { kind: 'Harassment grievance procedure', daysAgo: 21, attendeesCount: 940 },
] as const

export const COMPLIANCE_SLICE: SeedSlice = {
  id: 'compliance',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    const day = today()

    const [owner] = await ctx.db
      .select({ userId: roles.userId })
      .from(roles)
      .where(and(eq(roles.companyId, ctx.companyId), eq(roles.role, 'owner')))
    if (!owner) return counts

    const requestCtx: RequestCtx = {
      companyId: ctx.companyId,
      userId: owner.userId,
      roles: ['compliance'],
    }

    // ── Certificates ────────────────────────────────────────────────────────
    let certs = 0
    for (const spec of CERTIFICATES) {
      const [existing] = await ctx.db
        .select({ id: certificates.id })
        .from(certificates)
        .where(and(eq(certificates.companyId, ctx.companyId), eq(certificates.number, spec.number)))
      if (existing) continue

      await upsertCertificate(requestCtx, {
        kind: spec.kind,
        number: spec.number,
        issuedOn: daysFrom(day, spec.expiresInDays - 365),
        expiresOn: daysFrom(day, spec.expiresInDays),
      })
      certs += 1
    }
    counts.certificates = certs

    // ── An audit and its findings ───────────────────────────────────────────
    const [existingAudit] = await ctx.db
      .select({ id: audits.id })
      .from(audits)
      .where(eq(audits.companyId, ctx.companyId))

    if (!existingAudit) {
      const { auditId } = await recordAudit(requestCtx, {
        regime: 'bsci',
        auditor: 'Bureau Veritas · Dhaka',
        auditedOn: daysFrom(day, -18),
        score: '68.50',
      })
      counts.audits = 1

      let raised = 0
      for (const spec of FINDINGS) {
        const [finding] = await ctx.db
          .insert(findings)
          .values({
            companyId: ctx.companyId,
            auditId,
            severity: spec.severity,
            text: spec.text,
            evidence: [],
            createdBy: owner.userId,
          })
          .returning({ id: findings.id })
        if (!finding) continue

        // CAPs inserted directly with their deadlines, so one of them is already overdue —
        // `openCap` computes a deadline from the regime policy and today, which would put
        // every one of them safely in the future.
        await ctx.db.insert(caps).values({
          companyId: ctx.companyId,
          findingId: finding.id,
          ownerUserId: owner.userId,
          deadline: daysFrom(day, spec.capDaysFromNow),
          status: spec.severity === 'critical' ? 'in_progress' : 'open',
          closureEvidence: [],
        })
        raised += 1
      }
      counts.findings = raised
      counts.caps = raised
    }

    // ── Trainings ───────────────────────────────────────────────────────────
    let sessions = 0
    for (const spec of TRAININGS) {
      const [existing] = await ctx.db
        .select({ id: trainings.id })
        .from(trainings)
        .where(
          and(
            eq(trainings.companyId, ctx.companyId),
            eq(trainings.kind, spec.kind),
            eq(trainings.heldOn, daysFrom(day, -spec.daysAgo)),
          ),
        )
      if (existing) continue

      await recordTraining(requestCtx, {
        kind: spec.kind,
        heldOn: daysFrom(day, -spec.daysAgo),
        attendeesCount: spec.attendeesCount,
      })
      sessions += 1
    }
    counts.trainings = sessions

    return counts
  },
}
