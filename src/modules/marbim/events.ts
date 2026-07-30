/** Outbox events for X.2. */
export const MARBIM_EVENTS = {
  extractionQueued: 'marbim.extraction.queued',
  extractionSucceeded: 'marbim.extraction.succeeded',
  /** Retryable. A timeout or a rate limit. */
  extractionFailed: 'marbim.extraction.failed',
  /** NOT retryable — this extractor cannot read this input, and never will. */
  extractionRejected: 'marbim.extraction.rejected',
  /** An extractor's drafts are being corrected often enough to stop trusting it. */
  extractorDrifting: 'marbim.extractor.drifting',
} as const

export type MarbimEventName = (typeof MARBIM_EVENTS)[keyof typeof MARBIM_EVENTS]
