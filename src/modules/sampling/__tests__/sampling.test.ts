/**
 * Sampling vectors — written before the implementation.
 *
 * This module owns the PP-approval gate, which module 5.1 Cutting fails closed against.
 * That makes `ppGateDecision` the most consequential pure function in the repo so far:
 * too strict and a factory cannot cut anything; too loose and it cuts eighty thousand
 * garments to a spec the buyer has not signed.
 *
 * The judgement call this file pins down is `approved_with_comments`. In this industry it
 * means "go to bulk, and implement these changes" — it CLEARS the gate. A system that
 * held cutting for a clean verdict would miss every ship date, and a factory would route
 * around it within a week. But the comments have to travel with the pass, or the gate
 * becomes a rubber stamp on a garment nobody adjusted.
 */
import { describe, expect, it } from 'vitest'

import {
  daysBetween,
  latestRound,
  ppBlockingUrgency,
  ppGateDecision,
  SamplingError,
  stagePosition,
  totalSampleCost,
  type FeedbackRound,
  type SampleRequestForGate,
} from '../sampling'

const round = (over: Partial<FeedbackRound> = {}): FeedbackRound => ({
  round: 1,
  verdict: 'approved',
  commentCount: 0,
  recordedOn: '2026-07-10',
  ...over,
})

const request = (over: Partial<SampleRequestForGate> = {}): SampleRequestForGate => ({
  requestId: 'sr-1',
  type: 'pp',
  styleCode: 'ST-100',
  status: 'feedback',
  ...over,
})

describe('latestRound · the verdict in force', () => {
  it('1 · is the highest round number, not the last element', () => {
    // Rounds arrive from a query whose ordering nobody should have to trust.
    const rounds = [round({ round: 3, verdict: 'rejected' }), round({ round: 1 })]
    expect(latestRound(rounds)?.round).toBe(3)
  })

  it('2 · is null when there are no rounds', () => {
    expect(latestRound([])).toBeNull()
  })

  it('3 · refuses duplicate round numbers rather than picking one', () => {
    // Two round 2s means the feedback history is corrupt. Silently choosing either would
    // decide whether a factory may cut on the basis of row order.
    expect(() => latestRound([round({ round: 2 }), round({ round: 2, verdict: 'rejected' })])).toThrow(
      SamplingError,
    )
  })
})

describe('ppGateDecision · what lets a cutting floor start', () => {
  it('4 · blocks when there is no PP sample at all', () => {
    const result = ppGateDecision({ request: null, rounds: [], styleCode: 'ST-100' })

    expect(result.passed).toBe(false)
    expect(result.reasonKey).toBe('gates.pp_approval.no_sample')
  })

  it('5 · blocks a PP sample that has had no feedback yet', () => {
    const result = ppGateDecision({
      request: request({ status: 'in_work' }),
      rounds: [],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(false)
    expect(result.reasonKey).toBe('gates.pp_approval.awaiting_feedback')
  })

  it('6 · passes on a clean approval', () => {
    const result = ppGateDecision({
      request: request(),
      rounds: [round({ verdict: 'approved' })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(true)
  })

  it('7 · PASSES on approved_with_comments, and carries the comments with the pass', () => {
    // The buyer said go to bulk and change these things. Holding cutting for a clean
    // verdict would miss every ship date; passing without surfacing the comments would
    // make the gate a rubber stamp on a garment nobody adjusted.
    const result = ppGateDecision({
      request: request(),
      rounds: [round({ verdict: 'approved_with_comments', commentCount: 4 })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(true)
    expect(result.facts?.verdict).toBe('approved_with_comments')
    expect(result.facts?.openComments).toBe(4)
  })

  it('8 · blocks on a rejection', () => {
    const result = ppGateDecision({
      request: request(),
      rounds: [round({ verdict: 'rejected' })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(false)
    expect(result.reasonKey).toBe('gates.pp_approval.rejected')
  })

  it('9 · a later rejection revokes an earlier approval', () => {
    // The buyer approved round 1, then saw the corrected sample and rejected round 2.
    // Reading "has ever been approved" would let the floor cut against a dead approval.
    const result = ppGateDecision({
      request: request(),
      rounds: [round({ round: 1, verdict: 'approved' }), round({ round: 2, verdict: 'rejected' })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(false)
  })

  it('10 · a later approval clears an earlier rejection', () => {
    const result = ppGateDecision({
      request: request(),
      rounds: [round({ round: 1, verdict: 'rejected' }), round({ round: 2, verdict: 'approved' })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(true)
  })

  it('11 · an approved sample that has since been closed still clears the gate', () => {
    // Closing a sample request is filing it, not withdrawing the approval.
    const result = ppGateDecision({
      request: request({ status: 'closed' }),
      rounds: [round({ verdict: 'approved' })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(true)
  })

  it('12 · another sample type does not clear the PP gate', () => {
    // A TOP sample is approved after production starts and a fit sample before it. Only
    // the pre-production sample means "you may cut this".
    const result = ppGateDecision({
      request: request({ type: 'top' }),
      rounds: [round({ verdict: 'approved' })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(false)
    expect(result.reasonKey).toBe('gates.pp_approval.wrong_sample_type')
  })

  it('13 · an approval for another style does not clear this one', () => {
    const result = ppGateDecision({
      request: request({ styleCode: 'ST-200' }),
      rounds: [round({ verdict: 'approved' })],
      styleCode: 'ST-100',
    })

    expect(result.passed).toBe(false)
    expect(result.reasonKey).toBe('gates.pp_approval.style_mismatch')
  })
})

describe('ppBlockingUrgency · the escalation job', () => {
  it('14 · escalates when cutting is inside the window and PP is not approved', () => {
    const result = ppBlockingUrgency({
      cuttingPlannedDate: '2026-08-03',
      today: '2026-07-30',
      ppApproved: false,
      windowDays: 5,
    })

    expect(result.escalate).toBe(true)
    expect(result.daysToCutting).toBe(4)
  })

  it('15 · does not escalate once PP is approved', () => {
    const result = ppBlockingUrgency({
      cuttingPlannedDate: '2026-08-03',
      today: '2026-07-30',
      ppApproved: true,
      windowDays: 5,
    })
    expect(result.escalate).toBe(false)
  })

  it('16 · escalates harder once the cutting date has passed', () => {
    // Cutting was due three days ago and PP is still not approved. This is no longer a
    // reminder — the line is standing idle.
    const result = ppBlockingUrgency({
      cuttingPlannedDate: '2026-07-27',
      today: '2026-07-30',
      ppApproved: false,
      windowDays: 5,
    })

    expect(result.escalate).toBe(true)
    expect(result.daysToCutting).toBe(-3)
    expect(result.overdue).toBe(true)
  })

  it('17 · stays quiet outside the window', () => {
    const result = ppBlockingUrgency({
      cuttingPlannedDate: '2026-09-30',
      today: '2026-07-30',
      ppApproved: false,
      windowDays: 5,
    })
    expect(result.escalate).toBe(false)
  })

  it('18 · counts calendar days, not working days', () => {
    // A PP approval does not arrive faster because a weekend intervened.
    expect(daysBetween('2026-07-30', '2026-08-06')).toBe(7)
  })
})

describe('stagePosition · the floor progression', () => {
  it('19 · orders the stages as the sample physically moves', () => {
    expect(stagePosition('pattern')).toBeLessThan(stagePosition('cutting'))
    expect(stagePosition('cutting')).toBeLessThan(stagePosition('sewing'))
    expect(stagePosition('sewing')).toBeLessThan(stagePosition('finishing'))
    expect(stagePosition('finishing')).toBeLessThan(stagePosition('qc'))
    expect(stagePosition('qc')).toBeLessThan(stagePosition('dispatched'))
  })

  it('20 · refuses a stage it does not know', () => {
    expect(() => stagePosition('packing' as never)).toThrow(SamplingError)
  })
})

describe('totalSampleCost', () => {
  it('21 · sums costs exactly, in whole taka amounts', () => {
    expect(totalSampleCost(['1250.50', '340.25', '99.25'])).toBe('1690.00')
  })

  it('22 · is zero, not an error, when a sample cost nothing yet', () => {
    expect(totalSampleCost([])).toBe('0.00')
  })
})
