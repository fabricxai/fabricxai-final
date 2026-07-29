/** Outbox events for 3.2. */
export const PROCUREMENT_EVENTS = {
  prRaised: 'procurement.pr.raised',
  quoteReceived: 'procurement.quote.received',
  poIssued: 'procurement.po.issued',
  poConfirmed: 'procurement.po.confirmed',
  poLineClosed: 'procurement.po_line.closed',
  /** Received more than ordered, past tolerance — somebody is paying for surplus. */
  overReceipt: 'procurement.receipt.over',
  /** Not fully received by the expected date. Drives the overdue alert. */
  poOverdue: 'procurement.po.overdue',
  scoresComputed: 'procurement.scores.computed',
} as const

export type ProcurementEventName = (typeof PROCUREMENT_EVENTS)[keyof typeof PROCUREMENT_EVENTS]
