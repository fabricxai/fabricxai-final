/**
 * Module registration for 1.4.
 *
 * **This file is what makes cutting work.** Module 5.1 fails its PP gate closed when no
 * provider is registered, so importing this module is what turns "no lay can be spread"
 * into a real approval check. That is deliberate coupling in the safe direction: cutting
 * degrades to blocked, never to open.
 *
 * `sample_feedback_rounds` is a pending target because a buyer's comment sheet is a PDF
 * somebody transcribes, and that transcription decides whether a factory may cut. Every
 * drafted round therefore reaches a human before it reaches the gate.
 */
import { registerSyncHandler } from '../core/offline-sync'
import { registerModule } from '../core/registry'
import { registerPpApprovalProvider } from '../cutting/gates'

import { samplingToolPack } from './tools'
import {
  commitFeedbackRoundDraft,
  commitSampleRequestDraft,
  offlineAdvanceStage,
  offlineRecordFeedback,
  resolvePpApproval,
} from './service'
import { feedbackRoundPayload, SAMPLING_ZOD_MAP, stageAdvancePayload } from './zod'

export const samplingModule = registerModule({
  id: 'sampling',

  pendingTargets: ['sample_requests', 'sample_feedback_rounds'],
  zodMap: SAMPLING_ZOD_MAP,

  /**
   * The library search chiefly — the question asked before a style is made again — plus a
   * draft for the buyer's comment sheet, whose verdict is what the PP gate reads.
   */
  toolPack: samplingToolPack,

  /**
   * Both targets own their commit. Neither could before — core's generic write refuses
   * camelCase payload keys as column identifiers — and for feedback rounds it would also
   * have skipped the round numbering and the request's status move, leaving a verdict the
   * PP gate never saw.
   */
  commitHandlers: {
    sample_requests: commitSampleRequestDraft,
    sample_feedback_rounds: commitFeedbackRoundDraft,
  },

  // Merchandiser drafts, merchandising manager approves.
  approvalDefaults: { requiredRoles: ['owner', 'admin', 'merchandiser'] },

  domainPrimer: {
    version: '1.4.0',
    text: `You are helping a merchandiser run the sample room of a Bangladeshi export
factory.

THE SAMPLE TYPES, IN ORDER
proto (win the order) → fit (does it fit) → SMS (salesman's sample) → PP (pre-production)
→ TOP (top of production) → shipment. They are not interchangeable. Only the PP sample
means "you may cut bulk".

THE VERDICT THAT MATTERS
A buyer returns one of three verdicts per round:
- approved — cut.
- approved_with_comments — ALSO cut. In this industry it means "go to bulk and implement
  these changes". It opens the cutting gate, and the open comments travel with it. Always
  say how many comments are outstanding when you report this verdict; an approval with
  four unactioned comments is not the same thing as a clean one.
- rejected — do not cut. The sample is remade.

The verdict in force is the LATEST round, always. If a buyer approved round 1 and rejected
round 2, the answer is rejected. Never say a style is approved because it was approved
once.

THE GATE
Cutting cannot start without PP approval, and the block is server-side. If somebody asks
you to work around it, say what would clear it — which round, which buyer verdict — and
stop. Cutting early is how a factory produces an entire order to a spec the buyer then
rejects, and the fabric is already cut.

WHEN CUTTING IS CLOSE
If a planned cutting date is within five days and PP is not approved, that is an
escalation, not a reminder. Past the date, a line is standing idle. Say which it is.

DRAFTING
You may draft a sample request and a feedback round read off a buyer's comment sheet. Put
the sheet's page number on every comment so a reviewer can check the extraction against
the document. A misread verdict opens or closes a cutting floor.`,
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// The PP gate provider — 1.4 → 5.1
// ─────────────────────────────────────────────────────────────────────────────

registerPpApprovalProvider(resolvePpApproval)

// ─────────────────────────────────────────────────────────────────────────────
// Offline operations (rule 7) — the sample room runs on a tablet
// ─────────────────────────────────────────────────────────────────────────────

registerSyncHandler('sampling', 'advance_stage', async (ctx, tx, row) => {
  const payload = stageAdvancePayload.parse({ ...row.payload, offlineKey: row.offlineKey })
  const result = await offlineAdvanceStage(ctx, tx, payload)
  return { rowId: result.sampleRequestId }
})

registerSyncHandler('sampling', 'record_feedback', async (ctx, tx, row) => {
  const payload = feedbackRoundPayload.parse(row.payload)
  const result = await offlineRecordFeedback(ctx, tx, payload)
  return { rowId: result.roundId }
})
