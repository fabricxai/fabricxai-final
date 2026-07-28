/**
 * Outbox event names and payload types for 1.3 (brief §Events / jobs).
 *
 * Names are `<module>.<aggregate>.<verb>` and are part of this module's public contract:
 * other modules subscribe to them, so renaming one is a breaking change and gets a new
 * name plus a deprecation, never an edit.
 *
 * Payloads carry ids and the few facts a consumer needs to decide whether to care —
 * never whole rows. A consumer that needs the row reads it through this module's
 * queries, under its own tenant scope, at the time it actually runs. Embedding a row
 * snapshot would let a handler act on data that was already stale when it was queued.
 */

export const ORDER_EVENTS = {
  created: 'orders.order.created',
  statusChanged: 'orders.order.status_changed',
  breakdownRevised: 'orders.breakdown.revised',

  tnaGenerated: 'orders.tna.generated',
  milestoneActualized: 'orders.tna.milestone_actualized',
  /** Emitted by the nightly scan, not by a request path. */
  milestoneAtRisk: 'orders.tna.milestone_at_risk',
  milestoneLate: 'orders.tna.milestone_late',
  /** The ship date itself moved — the one every department downstream cares about. */
  exFactorySlipped: 'orders.tna.ex_factory_slipped',
} as const

export type OrderEventName = (typeof ORDER_EVENTS)[keyof typeof ORDER_EVENTS]

export interface OrderCreatedPayload {
  orderId: string
  buyerId: string
  poNumbers: readonly string[]
}

export interface OrderStatusChangedPayload {
  orderId: string
  from: string
  to: string
}

export interface BreakdownRevisedPayload {
  orderId: string
  orderStyleId: string
  revision: number
  /** True when the buyer asked for it — the expensive kind. */
  buyerRevision: boolean
  totalQty: number
}

export interface TnaGeneratedPayload {
  orderId: string
  templateId: string
  exFactoryDate: string
  milestoneCount: number
}

export interface MilestoneActualizedPayload {
  orderId: string
  milestoneId: string
  name: string
  actualDate: string
  /** How many downstream milestones moved as a result. */
  rippledCount: number
}

export interface MilestoneRiskPayload {
  orderId: string
  milestoneId: string
  name: string
  plannedDate: string
  ownerUserId: string | null
  ownerRole: string | null
  /** Negative when already past the planned date. */
  daysRemaining: number
}

export interface ExFactorySlippedPayload {
  orderId: string
  fromDate: string
  toDate: string
  slipDays: number
  /** Set when the new date breaches a linked LC — the reason this is urgent. */
  lcConflict: { lcId: string; lcNumber: string; kind: string } | null
}
