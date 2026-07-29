/** Outbox events for 6.1. */
export const PRODUCTION_EVENTS = {
  outputRecorded: 'production.output.recorded',
  downtimeOpened: 'production.downtime.opened',
  downtimeClosed: 'production.downtime.closed',
  /** reason=machine → module 9.1 opens a maintenance ticket and links back. */
  machineDowntime: 'production.downtime.machine',
  dayClosed: 'production.day.closed',
  runRateAtRisk: 'production.run_rate.at_risk',
} as const

export type ProductionEventName = (typeof PRODUCTION_EVENTS)[keyof typeof PRODUCTION_EVENTS]
