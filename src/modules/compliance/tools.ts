/**
 * MARBIM tools for 10.2 Compliance.
 *
 * An audit finding with a deadline nobody is watching becomes a failed re-audit, and a
 * certificate that lapses can stop a buyer accepting goods at all. Both are calendar
 * problems that only look urgent once they are late, which is exactly what an assistant
 * asked "what is coming up" should be able to answer.
 *
 * **Deadlines come from the factory's own policy, per regime and severity.** There are no
 * defaults: how long a critical BSCI finding may sit is not the same as a WRAP one, and a
 * constant here would report a deadline nobody agreed to.
 *
 * **One draft, and it is the findings batch.** An auditor's report is a list of findings in
 * prose with page references, and transcribing it is the clerical act. Everything after —
 * opening a corrective action, accepting evidence, closing it — is a judgement with a
 * role behind it, and `not_a_closer` and `self_certification` exist to keep it that way.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { recentAudits } from './queries'
import {
  auditPack,
  capExceptions,
  certificateLadder,
  openFindings,
  type CompliancePolicy,
} from './service'

async function policyFor(ctx: AnyCtx): Promise<CompliancePolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<CompliancePolicy>(ctx, 'compliance')
}

const noArgs = z.object({}).passthrough()
const todayInput = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
})
const packInput = z.object({
  auditId: z.string().uuid(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const audits: ReadTool = {
  kind: 'read',
  name: 'compliance.audits',
  description:
    'Audits on record with their regime, auditor, date and how many findings are already ' +
    'logged against each. A recent audit with no findings usually means the report has not ' +
    'been entered yet, not that it was clean.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => recentAudits(ctx),
}

const findings: ReadTool = {
  kind: 'read',
  name: 'compliance.open_findings',
  description:
    'Findings with no corrective action closed, by severity. A critical finding is the one ' +
    'that fails a re-audit — lead with those and say the regime it belongs to.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => openFindings(ctx),
}

const caps: ReadTool = {
  kind: 'read',
  name: 'compliance.cap_exceptions',
  description:
    'Corrective actions past or approaching their deadline, with days remaining. The ' +
    'deadline comes from the factory’s own policy for that regime and severity, so never ' +
    'quote a generic number of days.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return capExceptions(ctx, today)
  },
}

const certificates: ReadTool = {
  kind: 'read',
  name: 'compliance.certificate_ladder',
  description:
    'Certificates with how long each has left, bucketed by the factory’s alert rungs. An ' +
    'expired certificate can stop a buyer accepting goods, so an expiry inside the nearest ' +
    'rung is an action rather than a note.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return certificateLadder(ctx, today, await policyFor(ctx))
  },
}

const pack: ReadTool = {
  kind: 'read',
  name: 'compliance.audit_pack',
  description:
    'Everything one audit needs assembled: its findings, corrective actions, and the ' +
    'certificates the regime requires — including the ones MISSING. The gaps are the point ' +
    'of the pack; say them out loud rather than listing only what is present.',
  input: packInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = packInput.parse(args)
    return auditPack(ctx, input, await policyFor(ctx))
  },
}

/**
 * The findings draft.
 *
 * Severity scores lowest. It decides the CAP deadline through the factory's policy, so a
 * "major" transcribed as "minor" quietly buys weeks that the auditor did not give — and
 * unlike a mistyped date, nothing downstream looks wrong until the re-audit.
 */
const proposeFindingsInput = z.object({
  auditId: z.string().uuid(),
  findings: z
    .array(
      z.object({
        severity: z.string().min(1),
        text: z.string().min(1),
        sourcePage: z.number().int().positive().optional(),
      }),
    )
    .min(1),
})

const proposeFindings: DraftTool = {
  kind: 'draft',
  name: 'compliance.propose_findings',
  targetTable: 'findings',
  description:
    'Propose the findings from an audit report, each with its severity and the page it was ' +
    'read from. They land in the approve inbox: severity sets the corrective-action deadline, ' +
    'so one graded down buys time the auditor never granted.',
  input: proposeFindingsInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const batch = proposeFindingsInput.parse(args)

    return {
      targetTable: 'findings',
      operation: 'insert' as const,
      zodSchemaKey: 'findings_batch_v1',
      payload: {
        auditId: batch.auditId,
        findings: batch.findings.map((f) => ({ ...f, evidence: [] })),
      },
      fieldConfidence: {
        auditId: 0.96,
        // The wording is usually verbatim; the SEVERITY is a judgement read off a form,
        // and it is what sets the clock.
        findings: 0.67,
      },
      method: 'transcribed from an audit report · severity drives the CAP deadline',
    }
  },
}

export const complianceToolPack: ToolPack = {
  moduleId: 'compliance',
  tools: [audits, findings, caps, certificates, pack, proposeFindings],
}
