/** Outbox events for 1.1. */
export const BUYERS_EVENTS = {
  leadCreated: 'buyers.lead.created',
  leadStageChanged: 'buyers.lead.stage_changed',
  leadConverted: 'buyers.lead.converted',
  /** Nobody has spoken to them in a while. The desk's whole reason to exist. */
  leadQuiet: 'buyers.lead.quiet',
  /** ⚖ New terms version. 7.1 and 8.1 read the AQL and tolerance off it. */
  termsVersioned: 'buyers.terms.versioned',
  requirementsExtracted: 'buyers.requirements.extracted',
} as const

export type BuyersEventName = (typeof BUYERS_EVENTS)[keyof typeof BUYERS_EVENTS]
