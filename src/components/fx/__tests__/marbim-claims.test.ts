/**
 * The surface claims exactly the grounding it has — no more, and no less (plan 6.2 → 6.5).
 *
 * Before the execution loop, `chat` handed the model a list of tool names and recorded which
 * ones it ASKED for. Nothing ran them. The screen said otherwise: every requested call
 * rendered as a completed read with three amber slashes, the receipt counted them as "3
 * tools", and the footer promised "MARBIM states no number it did not read from a tool."
 *
 * That is the worst shape of wrong for this product specifically. The entire argument for
 * letting a model near an order book is that its claims are traceable — and a fabricated
 * citation is more dangerous than no citation, because it is precisely what stops somebody
 * checking a number before they act on it.
 *
 * 6.5 landed the loop, so tools now genuinely run and the strip is genuinely a citation. What
 * this file guards therefore changed shape rather than going away: the claim must be
 * CONDITIONAL on what happened. A turn where nothing ran still says so, in the same words,
 * because that turn is still common and still exactly as ungrounded as it ever was.
 *
 * ## Prompts are not copy
 *
 * "Never state a number you did not read from a tool result" appears in the system prompt and
 * in five module primers, and it stays: it is an INSTRUCTION to the model. The same sentence
 * shown to a PERSON is a promise about the product, and it is only true for the parts of an
 * answer a tool produced. This test tells the two apart by where they live.
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
  it('shows a tool as done only when it actually ran', () => {
    const surface = read('src/app/(app)/marbim/surface-client.tsx')

    /*
     * The step's state comes from the EXECUTION's own `ok`, never from a literal. The
     * regression this replaces was `result.toolCalls.map(... state: 'done')` — a constant
     * that turned every request into a citation, and which would now silently turn every
     * FAILED read into one too.
     */
    expect(surface).toContain("c.ok ? 'done' : 'failed'")
    expect(surface).not.toMatch(/toolCalls\.map[\s\S]{0,120}state:\s*'done'\s*,/)
  })

  it('keeps `requested` for the one case that is still a request', () => {
    // The iteration cap. The model asked for more tools, was refused because it had used its
    // four rounds, and answered from what it had — which is a request that was not run, and
    // the only remaining honest use of the state 6.2 introduced.
    expect(readFileSync('src/components/fx/ai.tsx', 'utf8')).toContain("'requested'")
    expect(read('src/app/(app)/marbim/surface-client.tsx')).toContain('cappedAtIterationLimit')
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

  it('says plainly when nothing ran', () => {
    /*
     * "3 tools" beside an answer that read nothing is the same fabricated citation in one
     * line of mono text. The zero case has to keep its own wording — a receipt that simply
     * omitted the tool count when there was none would read as though the question had been
     * answered the same way as one that read four tables.
     */
    const surface = read('src/app/(app)/marbim/surface-client.tsx')

    expect(surface).toContain('no tools run')
    // And the footer's ungrounded branch survives, in the words 6.2 chose.
    expect(surface).toContain('No tool was run')
  })

  it('only claims the factory’s data when a tool produced it', () => {
    // The conditional is the whole point. A footer that claimed grounding unconditionally
    // once tools existed would be the 6.2 bug again, one release later and harder to see.
    const surface = read('src/app/(app)/marbim/surface-client.tsx')

    expect(surface).toContain('toolsRun > 0')
    expect(surface).toContain('came from the department primers')
  })
})
