/** Outbox events for 1.5. */
export const COSTING_EVENTS = {
  /** Unlocks the quote draft in module 1.2 (brief §Events). */
  sheetApproved: 'costing.sheet.approved',
  sheetSuperseded: 'costing.sheet.superseded',
  /** Approved below the company floor — the owner signed it off knowingly. */
  belowFloorApproved: 'costing.sheet.below_floor_approved',
  templateRefreshed: 'costing.template.refreshed',
} as const

export type CostingEventName = (typeof COSTING_EVENTS)[keyof typeof COSTING_EVENTS]
