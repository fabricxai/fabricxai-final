/**
 * Sampling logic (brief 1.4 §Operations). Pure — no database, no clock.
 *
 * This module owns the PP-approval gate that 5.1 Cutting fails closed against, so
 * `ppGateDecision` decides whether a factory may cut. Too strict and nothing can be cut;
 * too loose and eighty thousand garments are made to a spec the buyer has not signed.
 *
 * The judgement worth stating: **`approved_with_comments` CLEARS the gate.** In this
 * industry it means "go to bulk, and implement these changes". A system that held cutting
 * for a clean verdict would miss every ship date and would be routed around within a
 * week. But the comment count travels with the pass, because a gate that says only "yes"
 * is a rubber stamp on a garment nobody adjusted.
 *
 * The verdict in force is always the LATEST round. "Has ever been approved" would let a
 * floor cut against an approval the buyer withdrew when they saw the corrected sample.
 */
export class SamplingError extends Error {
  override readonly name = 'SamplingError'
}

export type SampleType = 'proto' | 'fit' | 'sms' | 'pp' | 'top' | 'shipment'
export type SampleVerdict = 'approved' | 'approved_with_comments' | 'rejected'
export type SampleStage = 'pattern' | 'cutting' | 'sewing' | 'finishing' | 'qc' | 'dispatched'
export type SampleRequestStatus =
  | 'requested'
  | 'in_work'
  | 'dispatched'
  | 'feedback'
  | 'approved'
  | 'rejected'
  | 'closed'

/** The order a sample physically moves through the sample room. */
const STAGE_ORDER: readonly SampleStage[] = [
  'pattern',
  'cutting',
  'sewing',
  'finishing',
  'qc',
  'dispatched',
]

export function stagePosition(stage: SampleStage): number {
  const index = STAGE_ORDER.indexOf(stage)
  if (index < 0) throw new SamplingError(`"${stage}" is not a sample stage`)
  return index
}

export const SAMPLE_STAGES = STAGE_ORDER

// ─────────────────────────────────────────────────────────────────────────────
// Feedback rounds
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackRound {
  round: number
  verdict: SampleVerdict
  commentCount: number
  recordedOn: string
}

/**
 * The round whose verdict is in force.
 *
 * Chosen by round NUMBER, not by array position — rounds arrive from a query whose
 * ordering nobody should have to trust. Duplicate round numbers are refused rather than
 * resolved, because picking either would decide whether a factory may cut on the basis of
 * row order.
 */
export function latestRound(rounds: readonly FeedbackRound[]): FeedbackRound | null {
  if (rounds.length === 0) return null

  const seen = new Set<number>()
  for (const r of rounds) {
    if (seen.has(r.round)) {
      throw new SamplingError(`feedback round ${r.round} appears twice — the history is ambiguous`)
    }
    seen.add(r.round)
  }

  return rounds.reduce((latest, r) => (r.round > latest.round ? r : latest), rounds[0]!)
}

// ─────────────────────────────────────────────────────────────────────────────
// The PP gate
// ─────────────────────────────────────────────────────────────────────────────

export interface SampleRequestForGate {
  requestId: string
  type: SampleType
  styleCode: string
  status: SampleRequestStatus
}

export interface PpGateDecision {
  passed: boolean
  reasonKey?: string
  facts?: Record<string, unknown>
}

/**
 * May this style be cut? (core `GATES.ppApproval`, 1.4 → 5.1.)
 *
 * Every blocking path names WHY in its own key, so the floor tablet can show the cutter
 * what would clear it rather than a generic refusal. A gate that only says "no" gets
 * escalated to whoever can turn it off.
 */
export function ppGateDecision(input: {
  request: SampleRequestForGate | null
  rounds: readonly FeedbackRound[]
  styleCode: string
}): PpGateDecision {
  if (!input.request) {
    return {
      passed: false,
      reasonKey: 'gates.pp_approval.no_sample',
      facts: { styleCode: input.styleCode },
    }
  }

  if (input.request.type !== 'pp') {
    // A fit sample is approved before production and a TOP sample after it starts. Only
    // the pre-production sample means "you may cut this".
    return {
      passed: false,
      reasonKey: 'gates.pp_approval.wrong_sample_type',
      facts: { requestId: input.request.requestId, type: input.request.type },
    }
  }

  if (input.request.styleCode !== input.styleCode) {
    return {
      passed: false,
      reasonKey: 'gates.pp_approval.style_mismatch',
      facts: {
        requestId: input.request.requestId,
        approvedStyle: input.request.styleCode,
        cuttingStyle: input.styleCode,
      },
    }
  }

  const latest = latestRound(input.rounds)
  if (!latest) {
    return {
      passed: false,
      reasonKey: 'gates.pp_approval.awaiting_feedback',
      facts: { requestId: input.request.requestId, status: input.request.status },
    }
  }

  if (latest.verdict === 'rejected') {
    return {
      passed: false,
      reasonKey: 'gates.pp_approval.rejected',
      facts: {
        requestId: input.request.requestId,
        round: latest.round,
        comments: latest.commentCount,
      },
    }
  }

  // Note the deliberate absence of a status check here. Closing a sample request is
  // filing it, not withdrawing the approval, so a `closed` request with an approved
  // latest round still clears the gate.
  return {
    passed: true,
    facts: {
      requestId: input.request.requestId,
      verdict: latest.verdict,
      round: latest.round,
      approvedOn: latest.recordedOn,
      // Carried on the PASS, not only on a block: an approval with four open comments is
      // a different thing from a clean one, and the cutter should see which they have.
      openComments: latest.verdict === 'approved_with_comments' ? latest.commentCount : 0,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The blocking escalation
// ─────────────────────────────────────────────────────────────────────────────

/** Calendar days. A PP approval does not arrive faster because a weekend intervened. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new SamplingError(`"${from}" or "${to}" is not a date`)
  }
  return Math.round((b - a) / 86_400_000)
}

export interface BlockingUrgency {
  escalate: boolean
  daysToCutting: number
  overdue: boolean
}

/**
 * The `sampling.pp_blocking` escalation (brief §Jobs).
 *
 * Fires when a linked order's planned cutting date is inside the window and PP is still
 * unapproved. Past the date it keeps firing and flags `overdue` — at that point it is not
 * a reminder, the line is standing idle.
 */
export function ppBlockingUrgency(input: {
  cuttingPlannedDate: string
  today: string
  ppApproved: boolean
  windowDays: number
}): BlockingUrgency {
  if (!Number.isInteger(input.windowDays) || input.windowDays < 0) {
    throw new SamplingError('escalation window must be a whole number of days')
  }

  const daysToCutting = daysBetween(input.today, input.cuttingPlannedDate)

  return {
    escalate: !input.ppApproved && daysToCutting <= input.windowDays,
    daysToCutting,
    overdue: daysToCutting < 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample costs
// ─────────────────────────────────────────────────────────────────────────────

/** Sample costs are BDT, `numeric(14,2)`, summed as scaled integers. */
export function totalSampleCost(amounts: readonly string[]): string {
  let total = 0n
  for (const amount of amounts) {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      throw new SamplingError(`"${amount}" is not a money amount`)
    }
    const [whole = '0', fraction = ''] = amount.split('.')
    total += BigInt(whole + fraction.padEnd(2, '0'))
  }

  const digits = total.toString().padStart(3, '0')
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`
}
