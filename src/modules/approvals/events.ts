/** Outbox events for X.1. */
export const APPROVALS_EVENTS = {
  /** A draft has waited past the escalation window. Somebody is blocked and does not know. */
  draftAging: 'approvals.draft.aging',
} as const

export type ApprovalsEventName = (typeof APPROVALS_EVENTS)[keyof typeof APPROVALS_EVENTS]
