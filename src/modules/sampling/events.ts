/** Outbox events for 1.4. */
export const SAMPLING_EVENTS = {
  requested: 'sampling.request.created',
  stageAdvanced: 'sampling.stage.advanced',
  dispatched: 'sampling.dispatched',
  feedbackRecorded: 'sampling.feedback.recorded',
  /**
   * The one the rest of the factory waits for. Emitted when a PP sample's latest verdict
   * becomes approved (or approved-with-comments), which is what opens the cutting gate.
   */
  ppApproved: 'sampling.pp_approved',
  /** A later round withdrew an approval that had already opened the gate. */
  ppApprovalRevoked: 'sampling.pp_approval.revoked',
  /** Cutting is inside the window and PP is still not approved. */
  ppBlocking: 'sampling.pp_blocking',
} as const

export type SamplingEventName = (typeof SAMPLING_EVENTS)[keyof typeof SAMPLING_EVENTS]
