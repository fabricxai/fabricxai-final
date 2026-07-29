/** Outbox events for 5.1. */
export const CUTTING_EVENTS = {
  layCreated: 'cutting.lay.created',
  cutReported: 'cutting.report.filed',
  /** A cell outside tolerance. Merchandising needs this before the buyer finds it. */
  cutVariance: 'cutting.report.variance',
  bundlesGenerated: 'cutting.bundles.generated',
  /** Every ordered cell met → 1.3 auto-actualises the cutting milestone. */
  cuttingComplete: 'cutting.order.complete',
  /** Drawn fabric past the marker plan + threshold — the wastage anomaly alert. */
  wastageAnomaly: 'cutting.wastage.anomaly',
} as const

export type CuttingEventName = (typeof CUTTING_EVENTS)[keyof typeof CUTTING_EVENTS]
