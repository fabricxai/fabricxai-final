/**
 * Outbox events for 9.1.
 *
 * `partsShortfall` is the one worth explaining. When a mechanic fits more of a part than the
 * store believed it had, the resolution is not blocked — but somebody has to go and count
 * the shelf, and a console warning in a worker process is not a task anybody is assigned.
 * It is an event so it can become one.
 */

export const MAINTENANCE_EVENTS = {
  ticketOpened: 'maintenance.ticket.opened',
  ticketResolved: 'maintenance.ticket.resolved',
  pmCompleted: 'maintenance.pm.completed',
  /** More parts fitted than the store had on record — the count needs reconciling. */
  partsShortfall: 'maintenance.parts.shortfall',
  /** The monthly report found machines breaking down far more than the typical one. */
  breakdownOutliers: 'maintenance.breakdown.outliers',
} as const

export type MaintenanceEventName =
  (typeof MAINTENANCE_EVENTS)[keyof typeof MAINTENANCE_EVENTS]

export interface TicketOpenedPayload {
  ticketId: string
  machineId: string | null
  lineId: string | null
  priority: 'line_down' | 'high' | 'normal'
  source: 'downtime_auto' | 'manual'
}

export interface TicketResolvedPayload {
  ticketId: string
  machineId: string | null
  /** Set for an automatic ticket, so 6.1 can close the loop it opened. */
  downtimeId: string | null
  partsUsed: unknown[]
}

export interface PartsShortfallPayload {
  ticketId: string
  shortfalls: { partId: string; name: string; used: number; onHand: number; shortfall: number }[]
}
