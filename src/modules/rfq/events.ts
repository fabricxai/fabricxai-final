/** Outbox events for 1.2. */
export const RFQ_EVENTS = {
  created: 'rfq.created',
  quoteSent: 'rfq.quote.sent',
  /** ⚖ The one 1.3 creates an order from. Carries everything an order needs. */
  won: 'rfq.won',
  lost: 'rfq.lost',
  /** Deadline inside the window and still unquoted. */
  deadlineNear: 'rfq.deadline_near',
  /** A question nobody has answered. The quiet way an enquiry dies. */
  clarificationStale: 'rfq.clarification_stale',
} as const

export type RfqEventName = (typeof RFQ_EVENTS)[keyof typeof RFQ_EVENTS]
