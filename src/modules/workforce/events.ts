/** Outbox events for 10.1. Payload carries ids and counts — never a wage figure. */
export const WORKFORCE_EVENTS = {
  gazetteActivated: 'workforce.gazette.activated',
  runComputed: 'workforce.payroll.computed',
  runApproved: 'workforce.payroll.approved',
  runDisbursed: 'workforce.payroll.disbursed',
} as const

export type WorkforceEventName = (typeof WORKFORCE_EVENTS)[keyof typeof WORKFORCE_EVENTS]

/**
 * Deliberately no amounts. An outbox row is readable by anything that consumes the queue,
 * and payroll is hr+owner only — putting a net figure in an event would route around the
 * 🔒 restriction the service layer enforces.
 */
export interface PayrollRunPayload {
  runId: string
  period: string
  lines?: number
  flagged?: number
  approvedBy?: string | null
}
