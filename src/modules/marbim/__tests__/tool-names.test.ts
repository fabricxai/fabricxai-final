/**
 * Tool names across the Anthropic wire.
 *
 * Every tool in this platform is `module.name`, and the dot is load-bearing — it is how the
 * loop, the scope check and every log line tell which module a call belongs to. Anthropic
 * requires `^[a-zA-Z0-9_-]{1,128}$` and rejects the whole request when one does not match, so
 * the copilot answered NOTHING: the 400 arrives before a token is generated, and the surface
 * rendered it as "I lost the connection halfway through" — a network story for a schema
 * rejection.
 *
 * The encoding has to satisfy three things at once, and the third is the one worth a test:
 * every encoded name must be legal, decoding must return the original exactly, and two
 * distinct tools must never encode to the same string. That last is the dangerous one — a
 * collision would route a model's call to the wrong module's tool, silently, with a valid id.
 */
import 'dotenv/config'

import { describe, expect, it } from 'vitest'

import '@/modules/registry'
import { listModules } from '@/modules/core/registry'
import { decodeToolName, encodeToolName } from '@/modules/marbim/providers/anthropic'
import type { ToolPack } from '@/modules/marbim/tools'

/** The pattern the Messages API enforces. */
const ANTHROPIC_TOOL_NAME = /^[a-zA-Z0-9_-]{1,128}$/

const everyToolName = (): string[] =>
  listModules()
    .filter((m) => m.toolPack)
    .flatMap((m) => (m.toolPack as ToolPack).tools.map((tool) => tool.name))

describe('tool names · legal on the wire, unchanged in the loop', () => {
  it('1 · the real tool names are ILLEGAL unencoded — this is why the copilot answered nothing', () => {
    // Guards the guard. If tool naming ever stopped using dots, the encoding would be dead
    // code and this test would say so rather than passing for the wrong reason.
    const names = everyToolName()

    expect(names.length).toBeGreaterThan(50)
    expect(names.some((name) => !ANTHROPIC_TOOL_NAME.test(name))).toBe(true)
  })

  it('2 · every encoded name is accepted by the pattern', () => {
    for (const name of everyToolName()) {
      expect(encodeToolName(name), name).toMatch(ANTHROPIC_TOOL_NAME)
    }
  })

  it('3 · decoding returns the original exactly, for every tool', () => {
    // The loop keys off `module.tool`. A name that came back subtly different would look
    // like a tool that does not exist, which the loop reports as a failed call.
    for (const name of everyToolName()) {
      expect(decodeToolName(encodeToolName(name)), name).toBe(name)
    }
  })

  it('4 · no two tools collide — the failure that would route a call to the wrong module', () => {
    /*
     * The one that actually matters. `a.b` and `a_b` would both encode to `a_b` under a
     * single-underscore scheme, and the model asking for one would silently get the other:
     * a valid tool_use id, a real result, and the wrong module's data in an answer somebody
     * acts on. `__` is safe only while no name contains a double underscore, so this asserts
     * the property rather than trusting the convention to hold.
     */
    const names = everyToolName()
    const encoded = names.map(encodeToolName)

    expect(new Set(encoded).size).toBe(new Set(names).size)
  })

  it('5 · leaves an already-legal name alone', () => {
    // A tool without a dot must not be rewritten — the encoding is a fix for one character,
    // not a normalisation pass.
    expect(encodeToolName('approvals_my_queue')).toBe('approvals_my_queue')
    expect(decodeToolName('plain-name')).toBe('plain-name')
  })
})
