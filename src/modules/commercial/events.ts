/**
 * Outbox event names for module 2 (commercial): LC register and bonded warehouse.
 *
 * Names are part of the module's public contract — other modules subscribe, so renaming
 * one is a breaking change that gets a new name plus a deprecation, never an edit.
 */

export const COMMERCIAL_EVENTS = {
  lcConflictDetected: 'commercial.lc.conflict_detected',
  lcCountdown: 'commercial.lc.countdown',

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
