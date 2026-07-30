/**
 * Outbox events for 1.6 (brief §Operations — "emits close-out prompt notification to the
 * order's merchandiser for the note").
 *
 * The close-out prompt is the only reason the note field is ever filled in. Nobody opens a
 * closed order to write down why the fabric was late; they get asked, once, while they still
 * remember — which is also why the edit window is seven days and not indefinite.
 */

export const MEMORY_EVENTS = {
  /** An order's outcome has been compiled and is now readable. */
  outcomeCompiled: 'memory.outcome.compiled',
  /** Ask the order's merchandiser for the one thing no table can hold. */
  closeOutPrompt: 'memory.outcome.close_out_prompt',
  /** A style's fingerprint changed, so anything cached against it is stale. */
  styleEmbedded: 'memory.style.embedded',
} as const

export type MemoryEventName = (typeof MEMORY_EVENTS)[keyof typeof MEMORY_EVENTS]

export interface OutcomeCompiledPayload {
  orderId: string
  outcomeId: string
  /**
   * Which of the four inputs had data. A consumer that shows "0 defects" needs to know
   * whether that means a clean order or an order closed before 7.1 was in use.
   */
  sources: Record<string, boolean>
  piecesProduced: number
}

export interface CloseOutPromptPayload {
  orderId: string
  outcomeId: string
  /** Who to ask. Null when the order has no owner — the digest picks it up instead. */
  ownerUserId: string | null
  /** The window closes this many days after compilation. */
  noteWindowDays: number
}

export interface StyleEmbeddedPayload {
  styleCode: string
  fingerprintId: string
  model: string
}
