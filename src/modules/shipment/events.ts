/** Outbox events for 8.1. */
export const SHIPMENT_EVENTS = {
  finishingRecorded: 'shipment.finishing.recorded',
  cartonPacked: 'shipment.carton.packed',
  packingListGenerated: 'shipment.packing_list.generated',
  packingListApproved: 'shipment.packing_list.approved',
  /** Packed grid does not match the ordered grid. Merchandising before the buyer. */
  packingMismatch: 'shipment.packing_list.mismatch',
  /** ⚖ Goods have left. 1.3 actualises the final milestone; 11.1 drafts the invoice. */
  exFactoryConfirmed: 'shipment.ex_factory.confirmed',
  portStatusChanged: 'shipment.port_status.changed',
  /** Shipped quantity outside the LC band — needs a manager's acceptance. */
  toleranceBreach: 'shipment.lc_tolerance.breach',
  toleranceOverridden: 'shipment.lc_tolerance.overridden',
  docsReadyForBank: 'shipment.docs.ready_for_bank',
  /** The EXP gate refused a handoff. Worth a trail: somebody tried and could not. */
  expMissing: 'shipment.exp.missing',
  /** LC latest-shipment deadline approaching or passed with a balance outstanding. */
  latestShipmentCountdown: 'shipment.lc_latest_shipment.countdown',
  /** Departure refused because final inspection had not passed. Somebody tried. */
  finalInspectionBlocked: 'shipment.final_inspection.blocked',
  /** A failed final inspection was knowingly waived, by whom and why. */
  finalInspectionWaived: 'shipment.final_inspection.waived',
} as const

export type ShipmentEventName = (typeof SHIPMENT_EVENTS)[keyof typeof SHIPMENT_EVENTS]
