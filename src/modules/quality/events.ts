/** Outbox events for 7.1. */
export const QUALITY_EVENTS = {
  inlineCheckRecorded: 'quality.inline.recorded',
  dhuDayClosed: 'quality.dhu.day_closed',
  /** DHU past the company threshold — the line needs looking at today, not next week. */
  dhuAlert: 'quality.dhu.alert',
  /** Same code at the same operation on N consecutive days. A pattern, not a bad day. */
  repeatDefect: 'quality.defect.repeat_pattern',
  fabricInspected: 'quality.fabric.inspected',
  fabricRejected: 'quality.fabric.rejected',
  measurementFailed: 'quality.measurement.failed',
  /** ⚖ The verdict a shipment lives or dies on. */
  finalInspectionPassed: 'quality.final.passed',
  finalInspectionFailed: 'quality.final.failed',
  thirdPartyScheduled: 'quality.third_party.scheduled',
  thirdPartyResult: 'quality.third_party.result',
  /** Pre-final readiness against the TNA date. */
  finalNotReady: 'quality.final.not_ready',
} as const

export type QualityEventName = (typeof QUALITY_EVENTS)[keyof typeof QUALITY_EVENTS]
