/**
 * The model's own reasoning, replayed intact.
 *
 * Claude Sonnet 5 thinks on every turn whether or not we ask, and returns a SIGNED thinking
 * block. The Messages API requires that block to come back untouched on the next turn. This
 * provider read only `text` and `tool_use`, so the first turn worked and every turn after it
 * was handed to the model with its own reasoning removed — it replied with nothing at all
 * (`end_turn`, no text, no tool call), which the surface rendered as "I lost the connection
 * halfway through". Twice, deterministically: the retry rebuilt the same amputated history.
 *
 * That is why the bug survived a passing test suite. Nothing here is unit-testable in one
 * direction — capturing blocks is harmless if you never replay them, and replaying is
 * impossible if you never captured. The contract only exists across the round trip, so that
 * is what these tests exercise: what came off the wire goes back onto it, in order.
 */
import 'dotenv/config'

import { describe, expect, it } from 'vitest'

import { toAnthropicMessage } from '@/modules/marbim/providers/anthropic'

/** A thinking block as Sonnet 5 actually returns one: text empty (display defaults to omitted), signature carrying the weight. */
const THINKING = {
  type: 'thinking',
  thinking: '',
  signature: 'EsYDCokBCBAYAipAtDzdr+7lfG1znK0JOArV4YSSILJqwAuZ6d5zpYtgiYz6',
} as const

/** No readable text at all, and still mandatory on the way back. */
const REDACTED = { type: 'redacted_thinking', data: 'EroBCoYBGAIiQL2/hDsq' } as const

describe('thinking blocks · the turn the model recognises as its own', () => {
  it('1 · an assistant turn replays its reasoning — the block that was being dropped', () => {
    const turn = toAnthropicMessage({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'toolu_01', name: 'rfq.propose_enquiry', args: { title: 'AW26' } }],
      reasoning: [THINKING],
    })

    const blocks = turn.content as { type: string }[]
    expect(
      blocks.some((block) => block.type === 'thinking'),
      'the assistant turn went back without its thinking block — this is the bug: the model ' +
        'stops answering rather than continuing a sentence it no longer recognises',
    ).toBe(true)
  })

  it('2 · reasoning comes FIRST, before the tool calls it reasoned toward', () => {
    // Presence is not enough. Thinking precedes the tool_use blocks it led to; a turn with the
    // right blocks in the wrong order is rejected as malformed.
    const turn = toAnthropicMessage({
      role: 'assistant',
      content: 'Booking that for you.',
      toolCalls: [{ id: 'toolu_01', name: 'orders.book', args: {} }],
      reasoning: [THINKING],
    })

    const types = (turn.content as { type: string }[]).map((block) => block.type)
    expect(types[0]).toBe('thinking')
    expect(types.indexOf('thinking')).toBeLessThan(types.indexOf('tool_use'))
  })

  it('3 · the block is handed back byte-for-byte — the signature is over the original', () => {
    // Any "tidying" here (trimming the empty text, re-keying, dropping the signature) breaks
    // verification just as thoroughly as omitting the block, and would look like a fix.
    const turn = toAnthropicMessage({ role: 'assistant', content: 'x', reasoning: [THINKING] })

    expect((turn.content as unknown[])[0]).toEqual(THINKING)
  })

  it('4 · redacted_thinking survives too, though nothing can read it', () => {
    // Selecting blocks by what they ARE would have kept thinking and quietly dropped this one,
    // reintroducing the same failure on the subset of turns that get redacted.
    const turn = toAnthropicMessage({ role: 'assistant', content: '', reasoning: [REDACTED] })

    expect((turn.content as unknown[])[0]).toEqual(REDACTED)
  })

  it('5 · a user turn still opens with its tool results', () => {
    // Results must lead the user turn. Reasoning is assistant-only, so this guards the
    // ordering rule that was already load-bearing before reasoning was threaded through it.
    const turn = toAnthropicMessage({
      role: 'user',
      content: '',
      toolResults: [{ id: 'toolu_01', content: '{"rows":[]}' }],
    })

    expect((turn.content as { type: string }[])[0]!.type).toBe('tool_result')
  })

  it('6 · a turn with no reasoning is unchanged — providers without the concept are unaffected', () => {
    const turn = toAnthropicMessage({ role: 'assistant', content: 'Plain answer.' })

    expect(turn.content).toEqual([{ type: 'text', text: 'Plain answer.' }])
  })
})
