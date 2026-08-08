/**
 * The refusal-as-a-value seam (action-failure.ts).
 *
 * Production masks anything a server action THROWS — three live-test findings in a row
 * reached the screen as "Minified React error #441" instead of the sentence the service
 * wrote. These tests pin the round trip: an `ActionFailure` returned by an action, thrown
 * locally by `unwrap`, read back out by `actionErrorMessage` with the real copy intact.
 */
import { describe, expect, it } from 'vitest'

import { actionErrorMessage } from '../action-error'
import { ActionRefused, isActionFailure, unwrap, type ActionFailure } from '../action-failure'

const REFUSAL: ActionFailure = {
  failed: true,
  code: 'validation_failed',
  messageKey: 'rfq.errors.invalid',
  reason: 'an order needs a requested ship date — the TNA is built backwards from it',
}

describe('the refusal crosses the boundary as a value', () => {
  it('recognises a failure and nothing else', () => {
    expect(isActionFailure(REFUSAL)).toBe(true)
    expect(isActionFailure({ rfqId: 'abc' })).toBe(false)
    expect(isActionFailure(null)).toBe(false)
    expect(isActionFailure(undefined)).toBe(false)
    // A success payload that happens to have a `failed` field must not be swallowed.
    expect(isActionFailure({ failed: false, messageKey: 'x' })).toBe(false)
  })

  it('unwrap passes success through untouched', () => {
    const success = { rfqId: 'abc' }
    expect(unwrap<typeof success | ActionFailure>(success)).toBe(success)
  })

  it('unwrap throws an ActionRefused carrying the whole failure', () => {
    expect(() => unwrap(REFUSAL)).toThrow(ActionRefused)
    try {
      unwrap(REFUSAL)
    } catch (error) {
      expect((error as ActionRefused).failure).toEqual(REFUSAL)
    }
  })

  it('the service’s specific sentence beats the catalogue copy', () => {
    const message = actionErrorMessage(new ActionRefused(REFUSAL), 'fallback')
    expect(message).toBe(
      'an order needs a requested ship date — the TNA is built backwards from it',
    )
  })

  it('without a reason, the catalogue copy for the key is shown', () => {
    const message = actionErrorMessage(
      new ActionRefused({ failed: true, code: 'validation_failed', messageKey: 'rfq.errors.invalid' }),
      'fallback',
    )
    // Whatever the catalogue says for the key — a sentence, never the dotted key itself.
    expect(message).not.toBe('rfq.errors.invalid')
    expect(message).not.toBe('fallback')
  })

  it('an unknown key falls back rather than rendering a dotted identifier', () => {
    const message = actionErrorMessage(
      new ActionRefused({ failed: true, code: 'internal', messageKey: 'no.such.key' }),
      'fallback',
    )
    expect(message).toBe('fallback')
  })
})
