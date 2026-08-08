/**
 * A refusal carried ACROSS the server-action boundary, as a value.
 *
 * In production Next.js masks the message of anything a server action THROWS — the client
 * receives "Minified React error #441", whatever the server said. Three live-test findings
 * in a row surfaced that way: a Money precision throw, a costing zod refusal, and markWon's
 * "an order needs a requested ship date". Each was a perfectly good typed sentence that a
 * person needed to read and could not.
 *
 * The framework's own guidance (server-actions guide: "Constrain return values. Action
 * returns are serialized to the client.") is that an EXPECTED failure is data, not an
 * exception. So: services keep throwing `AppError` — that contract is right, and it is what
 * makes gates testable — and the ACTION layer catches it at the boundary and returns this
 * shape instead. Unexpected errors (bugs) still throw and still get masked, which is
 * correct: their message is nobody's business.
 *
 * The client side calls `unwrap()` on the result, which re-throws a local `ActionRefused`
 * that `actionErrorMessage` knows how to read — so existing catch-and-show code keeps
 * working with the real sentence in hand.
 */

export interface ActionFailure {
  /** Discriminant. Never present on a success payload. */
  failed: true
  /** `AppError.code` — 'validation_failed', 'forbidden', 'conflict', … */
  code: string
  /** i18n key for the catalogue copy. */
  messageKey: string
  /**
   * The one specific sentence, when the service gave one (`details.reason`). Shown in
   * preference to the catalogue copy because "an order needs a requested ship date" beats
   * any generic sentence filed under the key.
   */
  reason?: string
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { failed?: unknown }).failed === true &&
    typeof (value as { messageKey?: unknown }).messageKey === 'string'
  )
}

/** The client-side re-throw. `actionErrorMessage` reads `.failure` for the real copy. */
export class ActionRefused extends Error {
  override readonly name = 'ActionRefused'
  readonly failure: ActionFailure

  constructor(failure: ActionFailure) {
    super(`${failure.code}: ${failure.messageKey}`)
    this.failure = failure
  }
}

/** `unwrap(await someAction(input))` — success passes through, refusal throws locally. */
export function unwrap<T>(result: T | ActionFailure): T {
  if (isActionFailure(result)) throw new ActionRefused(result)
  return result
}
