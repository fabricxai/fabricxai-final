/**
 * The surface does not claim a grounding it does not have (plan 6.2, audit AI-B3).
 *
 * `chat` hands the model a list of tool names and records which ones it ASKED for. Nothing
 * executes them — there is no execution loop, and `runDraftTool`, the only path from a tool
 * to a write, has no production caller. So until 6.5 lands, every answer comes from the
 * department primers and the model's own knowledge, and no figure in one has been read from
 * the factory's data.
 *
 * The screen said otherwise. Every requested call was rendered as a completed read with
 * three amber slashes, the receipt counted them as "3 tools", and the footer promised
 * "MARBIM states no number it did not read from a tool."
 *
 * That is the worst shape of wrong for this product specifically. The entire argument for
 * letting a model near an order book is that its claims are traceable — and a fabricated
 * citation is more dangerous than no citation, because it is precisely what stops somebody
 * checking a number before they act on it.
 *
 * ## Prompts are not copy
 *
 * "Never state a number you did not read from a tool result" appears in the system prompt
 * and in five module primers, and it stays: it is an INSTRUCTION to the model, and with no
 * tool results a model following it says no numbers at all — which is the behaviour wanted.
 * The same sentence shown to a person is a promise the product cannot keep. This test tells
 * the two apart by where they live.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/** Where copy is rendered to a person. Prompts live in `modules/*`, and are exempt. */
const UI_ROOTS = ['src/app', 'src/components']

/** The promise itself, in the wordings a rewrite might reach for. */
const GROUNDING_CLAIMS = [
  'no number it did not read',
  'never states a number',
  'every figure comes from a tool',
  'read from a tool result',
]

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(path)
    }
  }
  return out
}

/**
 * The file with comments stripped.
 *
 * The claim is quoted in two file headers explaining why it was removed, and a scan over raw
 * text would fail on the explanation. Same lesson as `action-reachability` and
 * `marbim-off`: a mention is not an occurrence.
 */
const read = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

describe('no screen promises a grounding that does not exist', () => {
  it('carries none of the claims anywhere a person reads', () => {
    const offenders: string[] = []

    for (const root of UI_ROOTS) {
      for (const path of sourceFiles(root)) {
        const source = read(path).toLowerCase()
        for (const claim of GROUNDING_CLAIMS) {
          if (source.includes(claim)) offenders.push(`${path} — "${claim}"`)
        }
      }
    }

    expect(
      offenders,
      `nothing executes a tool yet (plan 6.5), so this is a promise the product cannot keep:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('leaves the same sentence in the prompts, where it is an instruction', () => {
    // Guards the guard from over-reach. Deleting it from the system prompt would REMOVE the
    // rule that makes a compliant model decline to invent figures — the opposite of the fix.
    expect(readFileSync('src/modules/marbim/marbim.ts', 'utf8')).toContain(
      'Never state a number you did not read from a tool result',
    )
  })
})

describe('a requested tool is not shown as a completed one', () => {
  it('maps the model’s tool calls to `requested`', () => {
    const surface = read('src/app/(app)/marbim/surface-client.tsx')

    expect(surface).toContain("state: 'requested'")
    // The specific regression: `result.toolCalls.map(... state: 'done')`, which turned every
    // request into a citation.
    expect(surface).not.toMatch(/toolCalls\.map[\s\S]{0,160}state:\s*'done'/)
  })

  it('offers `requested` as a state at all', () => {
    // A union without it means the only honest option is `pending`, which reads as "about
    // to happen" rather than "asked for, and nothing will".
    expect(readFileSync('src/components/fx/ai.tsx', 'utf8')).toContain("'requested'")
  })

  it('never paints an unrun step amber', () => {
    /*
     * Three filled slashes ARE the claim that a read took place — the strip is read at a
     * glance and the words under it are not. `requested` has to fall through to the inert
     * border colour with everything else that has not run.
     */
    const ai = readFileSync('src/components/fx/ai.tsx', 'utf8')
    // The slash itself: from the skew that draws it to the end of its colour ternary.
    const start = ai.indexOf('--fx-slash-angle')
    const slash = ai.slice(start, ai.indexOf('}}', start))

    expect(start, 'the tool strip no longer draws slashes').toBeGreaterThan(-1)
    expect(slash).toContain("step.state === 'done'")
    expect(slash).not.toContain("step.state === 'requested'")
  })

  it('does not count unrun tools as work in the receipt', () => {
    // "3 tools" beside an answer that read nothing is the same fabricated citation in one
    // line of mono text.
    const surface = read('src/app/(app)/marbim/surface-client.tsx')

    expect(surface).toContain('none run')
  })
})
