/**
 * The HANDOFFs describe code that exists (plan 8.1, audit PROC-1/BE-B7).
 *
 * `docs/handoffs/` was empty. The PLAYBOOK's rule is "no handoff → no build" with §8 empty
 * before work starts, and twenty-three modules shipped without one — a mandatory process
 * nobody had ever used, which is the same class of untruth as a flag nothing reads or a
 * caption promising a grounding that does not exist.
 *
 * Writing them retroactively cannot make the rule true. What it CAN do is give the pilot set
 * an acceptance checklist, and the only way that stays worth having is if it cannot silently
 * stop matching the code. So:
 *
 *  - every operation named in a §5 table must be exported by that module's `service.ts`;
 *  - every state machine named in §6 must exist in the module;
 *  - every gate named as `GATES.x` in §7 must be referenced by the module.
 *
 * This is the same shape as `action-reachability` and `marbim-off`: a document is allowed to
 * be prose, but the parts of it that are claims about code are checked.
 *
 * ## What it deliberately does not check
 *
 * Whether the description beside each name is accurate, whether §7's reasoning is sound, or
 * whether §8 is honest. Those are judgements, and a test that pretended to make them would
 * be the decoration this file exists to avoid.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const HANDOFF_DIR = 'docs/handoffs'

interface Handoff {
  file: string
  module: string
  operations: string[]
  machines: string[]
  gates: string[]
}

/** The section between one `## §n` heading and the next. */
function section(text: string, number: number): string {
  const start = text.indexOf(`## §${number} ·`)
  if (start === -1) return ''
  const next = text.indexOf('\n## §', start + 1)
  return text.slice(start, next === -1 ? undefined : next)
}

function parse(file: string): Handoff {
  const text = readFileSync(join(HANDOFF_DIR, file), 'utf8')

  // `moduleId`, not `module`: Next lints an assignment to a variable of that name, and it is
  // right to — `module` is a real binding in a CommonJS scope.
  const moduleId = /\*\*Module:\*\* `src\/modules\/([a-z]+)`/.exec(text)?.[1]
  if (!moduleId) throw new Error(`${file}: no **Module:** line`)

  /*
   * Operations come from the first column of the §5 table, split on `/` so
   * "`receiveGrn` / `receiveGrnIn`" is read as the two names it is. Names are the only part
   * of the row a machine can check.
   */
  const operations = [...section(text, 5).matchAll(/^\|\s*`([^`|]+)`[^|]*\|/gm)]
    .flatMap((match) => match[1]!.split(/`\s*\/\s*`/))
    .map((name) => name.replace(/`/g, '').trim())
    .filter((name) => name && name !== 'operation' && !name.endsWith('...In'))

  const machines = [...section(text, 6).matchAll(/`([a-zA-Z]+Machine)`/g)].map((m) => m[1]!)
  const gates = [...section(text, 7).matchAll(/`GATES\.([a-zA-Z]+)`/g)].map((m) => m[1]!)

  return { file, module: moduleId, operations: [...new Set(operations)], machines: [...new Set(machines)], gates: [...new Set(gates)] }
}

const handoffs = readdirSync(HANDOFF_DIR)
  .filter((file) => file.startsWith('HANDOFF-') && file.endsWith('.md'))
  .map(parse)

/** Every `.ts` in a module, concatenated — a machine may live in a pure file beside the service. */
function moduleSource(module: string): string {
  const dir = join('src', 'modules', module)
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => readFileSync(join(dir, entry), 'utf8'))
    .join('\n')
}

describe('the pilot set has a handoff at all', () => {
  it('covers the eight modules plan 8.1 names', () => {
    /*
     * Not "some handoffs exist". The pilot set is store, cutting, production, quality,
     * sampling, commercial, workforce and approvals, and a missing one is a module going into
     * a factory with no acceptance checklist.
     */
    expect(handoffs.map((h) => h.module).sort()).toEqual([
      'approvals',
      'commercial',
      'cutting',
      'production',
      'quality',
      'sampling',
      'store',
      'workforce',
    ])
  })

  it('each says which module it is about and admits it is retroactive', () => {
    for (const handoff of handoffs) {
      const text = readFileSync(join(HANDOFF_DIR, handoff.file), 'utf8')
      // The honesty is the point. A retroactive handoff presenting itself as a design lock
      // would be a worse document than none.
      expect(text, handoff.file).toMatch(/Retroactive/i)
      expect(text, handoff.file).toContain('## §8 · Open questions')
    }
  })
})

describe('§5 · every operation named is one that exists', () => {
  it.each(handoffs.map((h) => [h.module, h] as const))('%s', (_module, handoff) => {
    const service = readFileSync(join('src', 'modules', handoff.module, 'service.ts'), 'utf8')

    const missing = handoff.operations.filter(
      (name) => !new RegExp(`export (async )?(function|const) ${name}\\b`).test(service),
    )

    expect(
      missing,
      `${handoff.file} §5 names operations that ${handoff.module}/service.ts does not export. ` +
        `Either the code changed and the handoff did not, or the handoff was wrong when it ` +
        `was written:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it.each(handoffs.map((h) => [h.module, h] as const))('%s names some', (_module, handoff) => {
    // Guards the guard: a §5 table this parser could not read would pass the check above
    // with an empty list, silently.
    expect(handoff.operations.length, `${handoff.file} §5 parsed to nothing`).toBeGreaterThan(2)
  })
})

describe('§6 · every state machine named is one that exists', () => {
  it.each(handoffs.map((h) => [h.module, h] as const))('%s', (_module, handoff) => {
    const source = moduleSource(handoff.module)

    const missing = handoff.machines.filter(
      (name) => !source.includes(`export const ${name} = defineStateMachine`),
    )

    expect(missing, `${handoff.file} §6 names machines ${handoff.module} does not define`).toEqual(
      [],
    )
  })

  it('a module with no machine says so rather than omitting the section', () => {
    /*
     * `production` and `approvals` genuinely have none, and both say why — an hourly output
     * has no lifecycle, and the draft lifecycle lives in `pending_changes` under a row lock.
     * An empty §6 would read as an unfinished document rather than a decision.
     */
    for (const handoff of handoffs.filter((h) => h.machines.length === 0)) {
      const text = section(readFileSync(join(HANDOFF_DIR, handoff.file), 'utf8'), 6)
      expect(text, `${handoff.file} §6 is empty and unexplained`).toMatch(/None/i)
      expect(text.length, handoff.file).toBeGreaterThan(200)
    }
  })
})

describe('§7 · every gate named is one the module reaches for', () => {
  it.each(handoffs.map((h) => [h.module, h] as const))('%s', (_module, handoff) => {
    const source = moduleSource(handoff.module)

    const missing = handoff.gates.filter((gate) => !source.includes(`GATES.${gate}`))

    expect(
      missing,
      `${handoff.file} §7 claims gates ${handoff.module} never references. A gate documented ` +
        `and not enforced is worse than one that is neither:\n${missing.join('\n')}`,
    ).toEqual([])
  })
})
