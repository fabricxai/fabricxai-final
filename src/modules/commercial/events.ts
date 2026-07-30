/**
 * Outbox event names for module 2 (commercial): LC register and bonded warehouse.
 *
 * Names are part of the module's public contract — other modules subscribe, so renaming
 * one is a breaking change that gets a new name plus a deprecation, never an edit.
 */

export const COMMERCIAL_EVENTS = {
  lcConflictDetected: 'commercial.lc.conflict_detected',
  lcCountdown: 'commercial.lc.countdown',

  /** The bank amended the credit. Carries the diff, so downstream sees WHAT moved. */
  lcAmended: 'commercial.lc.amended',
  btbOpened: 'commercial.btb.opened',
  docsSubmitted: 'commercial.docs.submitted',
  /** The bank refused the presentation. The aging clock starts here. */
  docsDiscrepant: 'commercial.docs.discrepant',
  /** A discrepancy has sat past the escalation window. */
  discrepancyAging: 'commercial.docs.discrepancy_aging',
  /**
   * The money landed. 11.1 closes the receivable off this, which is why the payload carries
   * BOTH the invoiced and the realized amount — the difference is what the bank kept.
   */
  financeRealized: 'finance.realized',

  /** A UD has nothing left to draw. Stops the gate locking a spent declaration. */
  udExhausted: 'commercial.ud.exhausted',
  udExpired: 'commercial.ud.expired',
  /**
   * An owner approved a deliberate overdraw. The single most audit-worthy event in this
   * module — it means the factory knowingly issued more bonded material than customs
   * authorised, and both the owner digest and the compliance file need to see it.
   */
  udOverdrawn: 'commercial.ud.overdrawn',
} as const

export type CommercialEventName = (typeof COMMERCIAL_EVENTS)[keyof typeof COMMERCIAL_EVENTS]

export interface UdOverdrawnPayload {
  udId: string
  udNumber: string
  itemRef: string
  qty: string
  shortfall: string | null
  approvedBy: string | null
}

export interface UdLifecyclePayload {
  udId: string
  udNumber: string
  expiredOn?: string
}
