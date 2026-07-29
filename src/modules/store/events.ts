/** Outbox events for 3.1. */
export const STORE_EVENTS = {
  grnReceived: 'store.grn.received',
  grnInspected: 'store.grn.inspected',
  stockIssued: 'store.stock.issued',
  stockReturned: 'store.stock.returned',
  /** Free stock is short against a cutting date within the window (brief §Jobs). */
  lowStock: 'store.stock.low',
  /** No movement in 180 days — money sitting on a rack. */
  deadStock: 'store.stock.dead',
} as const

export type StoreEventName = (typeof STORE_EVENTS)[keyof typeof STORE_EVENTS]
