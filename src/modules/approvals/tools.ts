/**
 * MARBIM tools for X.1 Approve Inbox ⚖
 *
 * The one module MARBIM has a direct stake in. Everything the assistant proposes lands in
 * `pending_changes` and waits for a person, so "where did my draft go", "who has to sign
 * this", "why has nothing happened" and "should I believe your extraction" are questions
 * asked ABOUT this queue, more often than about any department. Until now it could answer
 * none of them: the module was absent from the registry, so it had no primer and no tools.
 *
 * **Nothing here writes, and there is no draft tool.** Approving is the human act this whole
 * layer exists to preserve; a model that could draft its way across the approve boundary
 * would make the boundary decoration (CLAUDE.md rule 3). `pendingTargets` is empty so there
 * is not even a table a draft could aim at.
 *
 * ## What is deliberately not readable here
 *
 * No payloads. `my_queue` returns a title, a module, an age and the weakest confidence —
 * never the fields being changed. `provenance` returns who signed what and WHICH fields they
 * corrected, never the values.
 *
 * The reason is the one workforce/tools.ts already documents: a chat answer is persisted in
 * `chat_turns`, a different table with different access rules from `pending_changes`. A
 * payroll draft's before/after copied into a transcript is copied out from under the
 * protection it was given, and the audit would faithfully record the read while the copy
 * already existed. Reading the fields of a draft is what the approve screen is for, where
 * the reviewer's role has already been checked against that specific draft's rule.
 *
 * `my_queue` is safe to offer broadly because it is routed, not filtered: `service.inbox()`
 * only returns drafts whose rule names a role this caller holds. The counts and the aging
 * list are not routed — they describe the factory's queue rather than the caller's — and
 * they carry no content at all, only how much is waiting and for how long.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { inboxRows, marbimTrust } from './queries'
import {
  agingDrafts,
  approversFor,
  auditChain,
  correctionRates,
  inboxCounts,
  type ApprovalsPolicy,
  type AuditChain,
} from './service'

/**
 * The tenant's own escalation window. Never the brief's 48 — a factory that set 24 and hears
 * "that is not overdue yet" from its own assistant learns the assistant is quoting somebody
 * else's policy. Imported lazily for the reason cutting's register documents: a static edge
 * from a module into Settings is an import cycle.
 */
async function policyFor(ctx: AnyCtx): Promise<ApprovalsPolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<ApprovalsPolicy>(ctx, 'approvals')
}

const noArgs = z.object({}).passthrough()

const queueInput = z.object({
  /** Narrow to one department's drafts — 'orders', 'store', 'commercial'. */
  moduleId: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const draftInput = z.object({ pendingChangeId: z.string().uuid() })

const trustInput = z.object({
  windowDays: z.number().int().min(1).max(365).optional(),
})

const myQueue: ReadTool = {
  kind: 'read',
  name: 'approvals.my_queue',
  description:
    'Drafts waiting on THIS person to sign, oldest first — with the module, what kind of ' +
    'change it is, how many hours it has waited, whether it is past the escalation window ' +
    'and the weakest per-field confidence behind it. Routed by role, so an empty result ' +
    'means nothing is waiting on them, not that the factory has nothing pending. The fields ' +
    'being changed are not here on purpose: those are read on the approve screen.',
  input: queueInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { moduleId, limit } = queueInput.parse(args)
    return inboxRows(ctx, { now: new Date(), moduleId, limit }, await policyFor(ctx))
  },
}

const byModule: ReadTool = {
  kind: 'read',
  name: 'approvals.queue_by_module',
  description:
    'How many drafts are pending in each department, across the whole factory. Counts only, ' +
    'no content. This is NOT what is waiting on the person asking — say so when quoting it, ' +
    'because "4 pending in workforce" and "4 waiting on you" are different facts and the ' +
    'second one is the one they can act on.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => inboxCounts(ctx),
}

const aging: ReadTool = {
  kind: 'read',
  name: 'approvals.aging',
  description:
    'Drafts that have waited longer than this factory’s escalation window, with how long ' +
    'and how many of the required approvals they have collected. A stuck draft blocks ' +
    'whatever proposed it — an unapproved BOM is an unquoted style — and the cost of one ' +
    'sitting is invisible until somebody asks why nothing happened. Name the ROLE that owes ' +
    'the signature, never a person to go around it with.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => agingDrafts(ctx, { now: new Date() }, await policyFor(ctx)),
}

const whoCanSign: ReadTool = {
  kind: 'read',
  name: 'approvals.who_can_sign',
  description:
    'For one draft: which roles may approve it, how many approvals it needs and how many it ' +
    'has. Answers "why is this still sitting there". A rule demanding two approvals means ' +
    'two DIFFERENT people — the same person clicking twice counts once. Give the role that ' +
    'is needed; do not go looking for an individual who could be asked to sign around it.',
  input: draftInput,
  execute: async (ctx: AnyCtx, args: unknown) => approversFor(ctx, draftInput.parse(args)),
}

/**
 * Provenance, with the values taken out.
 *
 * The chain answers "where did this row come from and who let it in", which is asked months
 * later when a figure is disputed — and answering it needs names, roles, timestamps and
 * WHICH fields moved. It does not need the values, and the values are the part that must not
 * be copied into a conversation. `changed_fields` is on the audit row precisely because most
 * audit questions are answerable without the row images.
 *
 * Exported and separate from the tool so the redaction is testable as a pure function. A
 * safety property enforced inside an executor is a safety property that only gets checked
 * when somebody stands up a database.
 */
export function redactChain(chain: AuditChain) {
  const { draft } = chain

  return {
    draft: {
      id: draft.id,
      moduleId: draft.moduleId,
      targetTable: draft.targetTable,
      operation: draft.operation,
      status: draft.status,
      source: draft.source,
      model: draft.model,
      extractorVersion: draft.extractorVersion,
      // The number the inbox sorts on — the field the extractor was least sure about.
      weakestConfidence: draft.confidenceMin,
      createdAt: draft.createdAt,
      reviewedAt: draft.reviewedAt,
      committedAt: draft.committedAt,
      committedRowId: draft.committedRowId,
      correctedFields: Object.keys(draft.corrections ?? {}),
    },
    approvals: chain.approvals.map((approval) => ({
      approver: approval.approverName,
      role: approval.approvedAsRole,
      at: approval.at,
      correctedFields: Object.keys(approval.corrections ?? {}),
    })),
    committed: chain.committedAudit.map((row) => ({
      action: row.action,
      actorRole: row.actorRole,
      at: row.occurredAt,
      changedFields: row.changedFields ?? [],
    })),
  }
}

const provenance: ReadTool = {
  kind: 'read',
  name: 'approvals.provenance',
  description:
    'The chain behind one draft: what proposed it (a person, an extraction, a chat), which ' +
    'model and extractor version, who approved it under which role and when, which fields ' +
    'each reviewer corrected, and the audit rows written against the row it became. Field ' +
    'NAMES only — never the values, which are read on the screen that owns them.',
  input: draftInput,
  execute: async (ctx: AnyCtx, args: unknown) =>
    redactChain(await auditChain(ctx, draftInput.parse(args))),
}

const corrections: ReadTool = {
  kind: 'read',
  name: 'approvals.correction_rates',
  description:
    'How often each department’s drafts were edited by a reviewer before being approved. ' +
    'The honest number about whether an extractor is worth trusting: a module whose drafts ' +
    'are always corrected should not be auto-approved whatever its confidence claims. ' +
    'Counts only human reviews — an auto-approved draft never met a reviewer and says ' +
    'nothing about whether one would have corrected it.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => correctionRates(ctx),
}

const trackRecord: ReadTool = {
  kind: 'read',
  name: 'approvals.marbim_track_record',
  description:
    'MARBIM’s own record in THIS factory: drafts proposed, drafts approved, fields ' +
    'reviewers corrected, drafts still waiting, over a window of days. Quote it when ' +
    'somebody asks whether to trust a draft — a new factory sees zeroes, and zeroes are the ' +
    'correct answer rather than a reason to sound established.',
  input: trustInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { windowDays } = trustInput.parse(args)
    return marbimTrust(ctx, windowDays)
  },
}

export const approvalsToolPack: ToolPack = {
  moduleId: 'approvals',
  tools: [myQueue, byModule, aging, whoCanSign, provenance, corrections, trackRecord],
}
