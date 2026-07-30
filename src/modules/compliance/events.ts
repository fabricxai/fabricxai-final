/**
 * Outbox events for 10.2.
 *
 * `criticalFinding` fires the moment an approved findings batch lands, not when a corrective
 * action is opened against it. The gap between those two is exactly where a critical finding
 * gets lost — somebody approves the batch on Friday and nobody assigns an owner until the
 * following week.
 */

export const COMPLIANCE_EVENTS = {
  /** A critical finding exists and has no owner yet. Straight to the owner's feed. */
  criticalFinding: 'compliance.finding.critical',
  capOpened: 'compliance.cap.opened',
  capClosed: 'compliance.cap.closed',
  /** Raised by the nightly ladder scan, per rung. */
  certificateExpiring: 'compliance.certificate.expiring',
  certificateExpired: 'compliance.certificate.expired',
  capOverdue: 'compliance.cap.overdue',
} as const

export type ComplianceEventName =
  (typeof COMPLIANCE_EVENTS)[keyof typeof COMPLIANCE_EVENTS]

export interface CriticalFindingPayload {
  auditId: string
  findingId: string
  text: string
}

export interface CapOpenedPayload {
  capId: string
  findingId: string
  severity: string
  ownerUserId: string
  deadline: string
}

export interface CertificateExpiryPayload {
  certificateId: string
  kind: string
  expiresOn: string
  /** Which rung fired. Absent on the expired event — it is off the ladder. */
  rung?: number
  daysRemaining: number
}
