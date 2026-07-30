/**
 * 10.2 Compliance & Audit — pure vectors, written before the implementation.
 *
 * Compliance is where a system's optimism becomes a delisting. Four things below are the
 * ones that would actually cost a factory its buyer:
 *
 *  - an EXPIRED certificate must never appear as "due in N days". It is not on the ladder;
 *    it is already off the end of it, and a fire licence that lapsed last month showing up
 *    in the same colour as one expiring next month is how it stays lapsed.
 *  - a corrective action cannot close without closure evidence. A closed CAP with nothing
 *    behind it is worse than an open one, because the open one is still on somebody's list.
 *  - a critical finding's deadline comes from the regime's policy and is never defaulted.
 *  - the audit pack reports what is MISSING. A pack that quietly omits an absent document
 *    is handed to an auditor as though it were complete.
 */
import { describe, expect, it } from 'vitest'

import {
  auditPackGaps,
  assertCapClosure,
  capDeadline,
  capEscalation,
  certificateStatus,
  ComplianceError,
  expiryLadder,
} from '../compliance'

const TODAY = '2026-03-10'
const RUNGS = [90, 60, 30] as const

describe('certificateStatus · where a certificate sits', () => {
  it('1 · reports days remaining and the rung it has reached', () => {
    // 2026-06-08 is 90 days out.
    expect(certificateStatus({ expiresOn: '2026-06-08', today: TODAY, rungs: RUNGS })).toEqual({
      state: 'notice',
      daysRemaining: 90,
      rung: 90,
    })
    expect(certificateStatus({ expiresOn: '2026-04-09', today: TODAY, rungs: RUNGS })).toEqual({
      state: 'warning',
      daysRemaining: 30,
      rung: 30,
    })
  })

  it('2 · anything beyond the outermost rung is simply valid', () => {
    expect(certificateStatus({ expiresOn: '2027-01-01', today: TODAY, rungs: RUNGS })).toMatchObject(
      { state: 'valid', rung: null },
    )
  })

  it('3 · an EXPIRED certificate is its own state, never a rung', () => {
    // Reported as "0 days" or as the 30-day rung, a lapsed fire licence sits in the same
    // list as one expiring next month and stays lapsed.
    const status = certificateStatus({ expiresOn: '2026-02-28', today: TODAY, rungs: RUNGS })
    expect(status.state).toBe('expired')
    expect(status.rung).toBeNull()
    expect(status.daysRemaining).toBe(-10)
  })

  it('4 · expiring TODAY is expired, not valid for one more day', () => {
    // The certificate is invalid on its expiry date, which is the day an inspector arrives.
    expect(certificateStatus({ expiresOn: TODAY, today: TODAY, rungs: RUNGS }).state).toBe('expired')
  })

  it('5 · a certificate with no expiry is perpetual, not expired', () => {
    expect(certificateStatus({ expiresOn: null, today: TODAY, rungs: RUNGS })).toEqual({
      state: 'perpetual',
      daysRemaining: null,
      rung: null,
    })
  })
})

describe('expiryLadder · the list somebody works down', () => {
  const certificates = [
    { certificateId: 'c1', kind: 'fire', expiresOn: '2026-06-08' },
    { certificateId: 'c2', kind: 'boiler', expiresOn: '2026-02-28' },
    { certificateId: 'c3', kind: 'bond', expiresOn: '2027-01-01' },
    { certificateId: 'c4', kind: 'factory', expiresOn: '2026-04-09' },
    { certificateId: 'c5', kind: 'trade', expiresOn: null },
  ]

  it('6 · puts what has already lapsed at the top', () => {
    const ladder = expiryLadder(certificates, TODAY, RUNGS)
    expect(ladder[0]!.certificateId).toBe('c2')
    expect(ladder[0]!.state).toBe('expired')
  })

  it('7 · orders the rest by how soon they go', () => {
    const ladder = expiryLadder(certificates, TODAY, RUNGS)
    expect(ladder.map((c) => c.certificateId)).toEqual(['c2', 'c4', 'c1', 'c3', 'c5'])
  })

  it('8 · a perpetual certificate is last, not first', () => {
    // Null sorts before everything in a naive comparison, which would put the one thing
    // that never expires at the top of the list of things about to.
    const ladder = expiryLadder(certificates, TODAY, RUNGS)
    expect(ladder.at(-1)!.certificateId).toBe('c5')
  })
})

describe('capDeadline · when a finding has to be fixed by', () => {
  const POLICY = { critical: 7, major: 30, minor: 60, observation: 90 }

  it('9 · counts from the audit date, by severity', () => {
    expect(capDeadline({ severity: 'critical', auditDate: '2026-03-01', policy: POLICY })).toBe(
      '2026-03-08',
    )
    expect(capDeadline({ severity: 'major', auditDate: '2026-03-01', policy: POLICY })).toBe(
      '2026-03-31',
    )
  })

  it('10 · REFUSES a severity the regime policy does not cover', () => {
    // A missing entry silently falling back to the longest window gives a critical finding
    // — an unguarded machine, a locked exit — ninety days to be dealt with.
    expect(() =>
      capDeadline({
        severity: 'critical',
        auditDate: '2026-03-01',
        policy: { major: 30, minor: 60, observation: 90 } as never,
      }),
    ).toThrow(ComplianceError)
  })

  it('11 · REFUSES a policy that gives a critical finding longer than a major one', () => {
    // Not arithmetic, but it is the mistake that matters: whoever configured it inverted
    // the severities, and every critical finding after that gets the slow lane.
    expect(() =>
      capDeadline({
        severity: 'critical',
        auditDate: '2026-03-01',
        policy: { critical: 45, major: 30, minor: 60, observation: 90 },
      }),
    ).toThrow(ComplianceError)
  })
})

describe('assertCapClosure · a closed CAP means something happened', () => {
  it('12 · accepts a closure with evidence', () => {
    expect(() =>
      assertCapClosure({
        severity: 'major',
        closureEvidence: [{ documentId: 'doc-1', note: 'Photo of new guard fitted' }],
      }),
    ).not.toThrow()
  })

  it('13 · REFUSES to close with no evidence at all', () => {
    // A closed CAP with nothing behind it is worse than an open one: the open one is still
    // on somebody's list, and the closed one tells the next auditor it was dealt with.
    expect(() => assertCapClosure({ severity: 'minor', closureEvidence: [] })).toThrow(
      ComplianceError,
    )
  })

  it('14 · REFUSES evidence that is only a note on a CRITICAL finding', () => {
    // "Fixed it" against a locked fire exit is a sentence, not evidence. Critical closures
    // need a document — a photo, a certificate, an inspection report.
    expect(() =>
      assertCapClosure({ severity: 'critical', closureEvidence: [{ note: 'Done' }] }),
    ).toThrow(ComplianceError)
  })

  it('15 · a note alone is enough for an observation', () => {
    expect(() =>
      assertCapClosure({ severity: 'observation', closureEvidence: [{ note: 'Noted, no action' }] }),
    ).not.toThrow()
  })
})

describe('capEscalation · who hears about it', () => {
  it('16 · says nothing while a CAP is inside its deadline', () => {
    expect(
      capEscalation({ severity: 'major', deadline: '2026-03-20', today: TODAY, status: 'open' }),
    ).toBe('none')
  })

  it('17 · escalates an overdue major to a manager', () => {
    expect(
      capEscalation({ severity: 'major', deadline: '2026-03-01', today: TODAY, status: 'open' }),
    ).toBe('manager')
  })

  it('18 · an overdue CRITICAL goes straight to the owner', () => {
    expect(
      capEscalation({ severity: 'critical', deadline: '2026-03-09', today: TODAY, status: 'open' }),
    ).toBe('owner')
  })

  it('19 · an OPEN critical escalates to the owner even before its deadline', () => {
    // A critical finding is a locked exit or an unguarded machine. Nobody waits seven days
    // to mention it, and "within deadline" is not a reason for silence.
    expect(
      capEscalation({ severity: 'critical', deadline: '2026-03-20', today: TODAY, status: 'open' }),
    ).toBe('owner')
  })

  it('20 · a closed CAP escalates to nobody, however late it was', () => {
    expect(
      capEscalation({ severity: 'critical', deadline: '2025-01-01', today: TODAY, status: 'closed' }),
    ).toBe('none')
  })

  it('21 · evidence submitted still escalates when overdue — nobody has accepted it', () => {
    // Submitted is not closed. An auditor has to look at it, and a CAP parked in
    // `evidence_submitted` past its deadline is exactly where things quietly stop.
    expect(
      capEscalation({
        severity: 'major',
        deadline: '2026-03-01',
        today: TODAY,
        status: 'evidence_submitted',
      }),
    ).toBe('manager')
  })
})

describe('auditPackGaps · what the pack does NOT have', () => {
  const base = {
    audit: { auditId: 'a1', regime: 'rsc' as const, reportDocumentId: 'doc-report' },
    findings: [
      { findingId: 'f1', severity: 'critical' as const },
      { findingId: 'f2', severity: 'minor' as const },
    ],
    caps: [
      { capId: 'cap1', findingId: 'f1', status: 'closed' as const, closureEvidenceCount: 2 },
      { capId: 'cap2', findingId: 'f2', status: 'closed' as const, closureEvidenceCount: 1 },
    ],
    certificates: [{ kind: 'fire', expiresOn: '2027-01-01' }],
    requiredCertificates: ['fire'],
  }

  it('22 · a complete pack has no gaps', () => {
    expect(auditPackGaps(base, TODAY)).toEqual([])
  })

  it('23 · names a finding with no corrective action at all', () => {
    const gaps = auditPackGaps({ ...base, caps: [base.caps[0]!] }, TODAY)
    expect(gaps).toContainEqual({ kind: 'finding_without_cap', ref: 'f2' })
  })

  it('24 · names a required certificate that has EXPIRED', () => {
    const gaps = auditPackGaps(
      { ...base, certificates: [{ kind: 'fire', expiresOn: '2026-02-01' }] },
      TODAY,
    )
    expect(gaps).toContainEqual({ kind: 'certificate_expired', ref: 'fire' })
  })

  it('25 · names a required certificate that is simply absent', () => {
    const gaps = auditPackGaps({ ...base, certificates: [] }, TODAY)
    expect(gaps).toContainEqual({ kind: 'certificate_missing', ref: 'fire' })
  })

  it('26 · names an audit with no report document', () => {
    const gaps = auditPackGaps(
      { ...base, audit: { ...base.audit, reportDocumentId: null } },
      TODAY,
    )
    expect(gaps).toContainEqual({ kind: 'report_missing', ref: 'a1' })
  })

  it('27 · names an open CAP rather than exporting around it', () => {
    const gaps = auditPackGaps(
      {
        ...base,
        caps: [
          base.caps[0]!,
          { capId: 'cap2', findingId: 'f2', status: 'in_progress' as const, closureEvidenceCount: 0 },
        ],
      },
      TODAY,
    )
    expect(gaps).toContainEqual({ kind: 'cap_open', ref: 'cap2' })
  })

  it('28 · names a CAP closed with no evidence behind it', () => {
    // The pack is what gets handed to the next auditor. A closure with nothing behind it is
    // the single thing they are most likely to pull on.
    const gaps = auditPackGaps(
      {
        ...base,
        caps: [
          base.caps[0]!,
          { capId: 'cap2', findingId: 'f2', status: 'closed' as const, closureEvidenceCount: 0 },
        ],
      },
      TODAY,
    )
    expect(gaps).toContainEqual({ kind: 'cap_closed_without_evidence', ref: 'cap2' })
  })
})
