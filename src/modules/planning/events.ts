/** Outbox events for 4.1. */
export const PLANNING_EVENTS = {
  allocationCreated: 'planning.allocation.created',
  allocationMoved: 'planning.allocation.moved',
  /** A planner committed a plan they were told does not fit. Worth its own trail. */
  overloadAccepted: 'planning.overload.accepted',
  scenarioApplied: 'planning.scenario.applied',
  /** Consumed by 1.3 TNA — moving sewing shifts every milestone downstream of it. */
  sewingWindowChanged: 'planning.sewing_window.changed',
  changeoverDensityWarning: 'planning.changeover_density.warning',
} as const

export type PlanningEventName = (typeof PLANNING_EVENTS)[keyof typeof PLANNING_EVENTS]
