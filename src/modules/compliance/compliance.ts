/**
 * 10.2 Compliance & Audit — pure logic.
 *
 * Everything here exists to stop the system being optimistic about compliance, because the
 * cost of that optimism is not a wrong number on a screen — it is a buyer delisting a
 * factory, or an inspector arriving to find a licence that lapsed in February.
 *
 * The four decisions that carry the weight:
 *
 *  - An EXPIRED certificate is a state of its own, never a rung on the ladder. Reported as
 *    "0 days remaining" it sits in the same list, in the same colour, as one expiring next
 *    month, and it stays lapsed.
 *  - A corrective action cannot close without evidence, and a CRITICAL one needs a document.
 *    "Fixed it" against a locked fire exit is a sentence, not evidence.
 *  - Deadlines come from the regime's policy and are never defaulted. A missing entry
 *    quietly taking the longest window gives an unguarded machine ninety days.
 *  - The audit pack reports what is MISSING. A pack that silently omits an absent document
 *    is handed to an auditor as though it were complete, and that is the one thing they
 *    will pull on.
 *
 * Nothing here reads a clock or a database.
 */

export class ComplianceError extends Error {
  override readonly name = 'ComplianceError'
}

const MS_PER_DAY = 86_400_000

export type Severity = 'critical' | 'major' | 'minor' | 'observation'
export type CapStatus = 'open' | 'in_progress' | 'evidence_submitted' | 'closed'

const parseDate = (value: string, what: string): number => {
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed)) throw new ComplianceError(`${what} is not a date: ${value}`)
  return parsed
}

const daysBetween = (from: string, to: string): number =>
  Math.round((parseDate(to, 'to') - parseDate(from, 'from')) / MS_PER_DAY)

// ─────────────────────────────────────────────────────────────────────────────
// Certificates
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateState = 'expired' | 'warning' | 'notice' | 'valid' | 'perpetual'

export interface CertificateStatus {
  state: CertificateState
  /** Negative once expired. Null for a certificate with no expiry. */
  daysRemaining: number | null
  /** The alert rung it has reached, or null. */
  rung: number | null
}

/**
 * Where a certificate sits relative to its expiry.
 *
 * Two decisions worth stating plainly.
 *
 * **Expiring today is EXPIRED.** A licence is not valid on the day it runs out, and the day
 * it runs out is exactly the day an inspector turns up. Counting it as one more day of
 * validity is the kind of off-by-one that a regulator does not find charming.
 *
 * **Expired is not a rung.** It gets its own state so no report can render a lapsed fire
 * licence in the same row as one expiring next month.
 */
export function certificateStatus(input: {
  expiresOn: string | null
  today: string
  rungs: readonly number[]
}): CertificateStatus {
  if (input.expiresOn === null) {
    // A trade licence with no expiry is not "expiring in null days".
    return { state: 'perpetual', daysRemaining: null, rung: null }
  }

  const daysRemaining = daysBetween(input.today, input.expiresOn)

  if (daysRemaining <= 0) return { state: 'expired', daysRemaining, rung: null }

  // Innermost rung first: 30 days out is a warning even though it is also inside 90.
  const ordered = [...input.rungs].sort((a, b) => a - b)
  const rung = ordered.find((days) => daysRemaining <= days) ?? null

  if (rung === null) return { state: 'valid', daysRemaining, rung: null }

  return {
    state: rung === ordered[0] ? 'warning' : 'notice',
    daysRemaining,
    rung,
  }
}

export interface CertificateRow {
  certificateId: string
  kind: string
  expiresOn: string | null
}

export interface LadderRow extends CertificateRow, CertificateStatus {}

/**
 * Every certificate, worst first.
 *
 * The sort is the whole point: lapsed at the top, then soonest, then the perpetual ones
 * last. A naive comparison puts null first, which would head the list of things about to
 * expire with the one thing that never does.
 */
export function expiryLadder(
  certificates: readonly CertificateRow[],
  today: string,
  rungs: readonly number[],
): LadderRow[] {
  return certificates
    .map((certificate) => ({
      ...certificate,
      ...certificateStatus({ expiresOn: certificate.expiresOn, today, rungs }),
    }))
    .sort((a, b) => {
      if (a.daysRemaining === null && b.daysRemaining === null) {
        return a.kind.localeCompare(b.kind)
      }
      if (a.daysRemaining === null) return 1
      if (b.daysRemaining === null) return -1
      return a.daysRemaining - b.daysRemaining || a.kind.localeCompare(b.kind)
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Corrective actions
// ─────────────────────────────────────────────────────────────────────────────

export type CapDeadlinePolicy = Readonly<Record<Severity, number>>

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'major', 'minor', 'observation']

/**
 * When a finding has to be fixed by, counted from the audit date.
 *
 * Refuses two things rather than producing a date.
 *
 * A severity the policy does not cover: falling back to the longest window would give a
 * critical finding — a locked exit, an unguarded machine — the same ninety days as a note
 * about labelling.
 *
 * A policy in which a critical finding gets longer than a major one: that is not arithmetic
 * this function can fix, it is a configuration somebody inverted, and every critical finding
 * afterwards would quietly take the slow lane.
 */
export function capDeadline(input: {
  severity: Severity
  auditDate: string
  policy: CapDeadlinePolicy
}): string {
  for (const severity of SEVERITY_ORDER) {
    if (typeof input.policy[severity] !== 'number') {
      throw new ComplianceError(`the deadline policy has no entry for "${severity}" findings`)
    }
  }

  for (let i = 1; i < SEVERITY_ORDER.length; i += 1) {
    const worse = input.policy[SEVERITY_ORDER[i - 1]!]
    const milder = input.policy[SEVERITY_ORDER[i]!]
    if (worse > milder) {
      throw new ComplianceError(
        `the deadline policy gives "${SEVERITY_ORDER[i - 1]}" findings ${worse} days and ` +
          `"${SEVERITY_ORDER[i]}" findings ${milder} — the severities are inverted`,
      )
    }
  }

  const days = input.policy[input.severity]
  return new Date(parseDate(input.auditDate, 'auditDate') + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
}

export interface ClosureEvidence {
  documentId?: string
  note?: string
}

/**
 * A CAP may only close on evidence.
 *
 * An open CAP is on somebody's list. A closed one tells the next auditor it was dealt with,
 * so closing without evidence does not just lose information — it actively asserts something
 * nobody can support.
 *
 * A CRITICAL closure needs a DOCUMENT. A photograph of the guard fitted, the electrician's
 * certificate, the inspection report. "Fixed it" typed into a box is exactly what a critical
 * finding is not allowed to be closed on.
 */
export function assertCapClosure(input: {
  severity: Severity
  closureEvidence: readonly ClosureEvidence[]
}): void {
  const evidence = input.closureEvidence.filter(
    (item) => item.documentId || item.note?.trim(),
  )

  if (evidence.length === 0) {
    throw new ComplianceError('a corrective action cannot be closed with no evidence behind it')
  }

  if (input.severity === 'critical' && !evidence.some((item) => item.documentId)) {
    throw new ComplianceError(
      'a critical finding needs a document to close on — a photo, a certificate, an ' +
        'inspection report — not a note',
    )
  }
}

export type Escalation = 'none' | 'manager' | 'owner'

/**
 * Who hears about a corrective action.
 *
 * An OPEN critical finding escalates to the owner immediately, before its deadline. That is
 * deliberate and it is the rule most likely to be argued with: the deadline is when the fix
 * must be done, not when somebody may first be told a fire exit is locked.
 *
 * `evidence_submitted` still escalates when overdue. Submitted is not closed — an auditor
 * has to accept it — and a CAP parked there past its deadline is precisely where these
 * things quietly stop moving.
 */
export function capEscalation(input: {
  severity: Severity
  deadline: string
  today: string
  status: CapStatus
}): Escalation {
  if (input.status === 'closed') return 'none'

  const overdue = daysBetween(input.today, input.deadline) < 0

  if (input.severity === 'critical') {
    // Not "critical AND overdue". Nobody waits out the clock on this one.
    return input.status === 'open' || overdue ? 'owner' : 'none'
  }

  return overdue ? 'manager' : 'none'
}

// ─────────────────────────────────────────────────────────────────────────────
// The audit pack
// ─────────────────────────────────────────────────────────────────────────────

export type GapKind =
  | 'report_missing'
  | 'finding_without_cap'
  | 'cap_open'
  | 'cap_closed_without_evidence'
  | 'certificate_missing'
  | 'certificate_expired'

export interface PackGap {
  kind: GapKind
  /** The finding, CAP, certificate kind or audit the gap is about. */
  ref: string
}

export interface PackInput {
  audit: { auditId: string; regime: string; reportDocumentId: string | null }
  findings: readonly { findingId: string; severity: Severity }[]
  caps: readonly {
    capId: string
    findingId: string
    status: CapStatus
    closureEvidenceCount: number
  }[]
  certificates: readonly { kind: string; expiresOn: string | null }[]
  requiredCertificates: readonly string[]
}

/**
 * What the pack does NOT have.
 *
 * The export itself is straightforward; this is the part that matters. A pack assembled from
 * whatever happened to be present looks complete to whoever hands it over, and the gaps are
 * found by the auditor instead — which is both the most expensive moment to find them and
 * the one where they look like concealment rather than an oversight.
 *
 * So the gaps come back as data, listed beside the pack, and there is no way to ask for the
 * pack without also being told what is missing from it.
 */
export function auditPackGaps(input: PackInput, today: string): PackGap[] {
  const gaps: PackGap[] = []

  if (!input.audit.reportDocumentId) {
    gaps.push({ kind: 'report_missing', ref: input.audit.auditId })
  }

  const capsByFinding = new Map(input.caps.map((cap) => [cap.findingId, cap]))

  for (const finding of input.findings) {
    const cap = capsByFinding.get(finding.findingId)
    if (!cap) {
      gaps.push({ kind: 'finding_without_cap', ref: finding.findingId })
      continue
    }
    if (cap.status !== 'closed') {
      gaps.push({ kind: 'cap_open', ref: cap.capId })
      continue
    }
    if (cap.closureEvidenceCount === 0) {
      // The thing an auditor is most likely to pull on: a closure with nothing behind it.
      gaps.push({ kind: 'cap_closed_without_evidence', ref: cap.capId })
    }
  }

  const byKind = new Map(input.certificates.map((certificate) => [certificate.kind, certificate]))

  for (const kind of input.requiredCertificates) {
    const certificate = byKind.get(kind)
    if (!certificate) {
      gaps.push({ kind: 'certificate_missing', ref: kind })
      continue
    }
    const status = certificateStatus({ expiresOn: certificate.expiresOn, today, rungs: [] })
    if (status.state === 'expired') {
      gaps.push({ kind: 'certificate_expired', ref: kind })
    }
  }

  return gaps
}
