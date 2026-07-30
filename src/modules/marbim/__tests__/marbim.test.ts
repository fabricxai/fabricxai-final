/**
 * MARBIM vectors — written before the implementation.
 *
 * X.2 is the module that lets a model write to an ERP, so almost everything here is a
 * refusal. Three rules carry the weight:
 *
 *  1. **Confidence must come from the extraction, and constants are forbidden.** The brief
 *     says so and 1.2's brief flags a hardcoded 0.85 as a defect. A confidence number that
 *     is really a constant is worse than none: it makes the approve inbox look like it is
 *     ranking drafts by reliability when it is ranking them by nothing.
 *  2. **A read tool cannot write and a draft tool cannot commit.** A draft tool returns a
 *     PROPOSAL; only `pending_changes` turns one into a row (rule 3). If a tool could write
 *     directly the entire trust layer is decoration.
 *  3. **The prompt is reproducible.** Every primer carries a version, and the assembled
 *     prompt records which versions went into it — otherwise "why did it say that last
 *     Tuesday" has no answer.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  assembleSystemPrompt,
  assertExtractionConfidence,
  MarbimError,
  redactForPrompt,
  scopeToolDefaults,
  type PrimerFragment,
} from '../marbim'
import { validateToolPack, type DraftTool, type ReadTool } from '../tools'

describe('assertExtractionConfidence · constants are forbidden', () => {
  const payload = { styleCode: 'ST-100', quantity: 12000, unit: 'pcs' }

  it('1 · accepts genuine per-field confidence', () => {
    expect(() =>
      assertExtractionConfidence({
        payload,
        fieldConfidence: { styleCode: 0.97, quantity: 0.83, unit: 0.91 },
        method: 'model_logprobs',
      }),
    ).not.toThrow()
  })

  it('2 · refuses a field with no confidence at all', () => {
    // A payload field the extractor said nothing about is a field nobody can review with
    // any sense of how much to look at it.
    expect(() =>
      assertExtractionConfidence({
        payload,
        fieldConfidence: { styleCode: 0.97, quantity: 0.83 },
        method: 'model_logprobs',
      }),
    ).toThrow(/unit/)
  })

  it('3 · refuses a CONSTANT across every field', () => {
    // The exact defect 1.2's brief flags. Real per-field confidence is essentially never
    // identical to three decimals across several fields.
    expect(() =>
      assertExtractionConfidence({
        payload,
        fieldConfidence: { styleCode: 0.85, quantity: 0.85, unit: 0.85 },
        method: 'model_logprobs',
      }),
    ).toThrow(/constant/i)
  })

  it('4 · allows a uniform value when the method declares why', () => {
    // A regex or table extractor genuinely produces one confidence for everything it
    // matched. That is legitimate — but it has to be said out loud rather than inferred.
    expect(() =>
      assertExtractionConfidence({
        payload,
        fieldConfidence: { styleCode: 1, quantity: 1, unit: 1 },
        method: 'deterministic_parse',
        uniformConfidenceJustification: 'Structured CSV: every field parsed or the row failed.',
      }),
    ).not.toThrow()
  })

  it('5 · a single-field payload is not a constant', () => {
    // One field cannot be uniform with anything.
    expect(() =>
      assertExtractionConfidence({
        payload: { styleCode: 'ST-100' },
        fieldConfidence: { styleCode: 0.85 },
        method: 'model_logprobs',
      }),
    ).not.toThrow()
  })

  it('6 · refuses confidence for a field that is not in the payload', () => {
    // A score for a field the extractor did not actually produce inflates the apparent
    // coverage of the extraction.
    expect(() =>
      assertExtractionConfidence({
        payload: { styleCode: 'ST-100' },
        fieldConfidence: { styleCode: 0.9, ghostField: 0.9 },
        method: 'model_logprobs',
      }),
    ).toThrow(/ghostField/)
  })

  it('7 · refuses an out-of-range score', () => {
    expect(() =>
      assertExtractionConfidence({
        payload: { styleCode: 'ST-100' },
        fieldConfidence: { styleCode: 1.4 },
        method: 'model_logprobs',
      }),
    ).toThrow(MarbimError)
  })

  it('8 · refuses an extraction with no method recorded', () => {
    // "Where did this number come from" must be answerable, and a method is how the
    // correction-rate report groups extractions later.
    expect(() =>
      assertExtractionConfidence({
        payload: { styleCode: 'ST-100' },
        fieldConfidence: { styleCode: 0.9 },
        method: '',
      }),
    ).toThrow(/method/i)
  })
})

describe('assembleSystemPrompt · reproducible by construction', () => {
  const primers: PrimerFragment[] = [
    { moduleId: 'costing', version: '1.5.0', text: 'Margin on price and cost differ.' },
    { moduleId: 'cutting', version: '5.1.0', text: 'Completion is a grid, not a total.' },
  ]

  it('9 · includes every primer in scope', () => {
    const prompt = assembleSystemPrompt({ primers, scope: { moduleId: 'costing' } })

    expect(prompt.text).toContain('Margin on price and cost differ.')
    expect(prompt.text).toContain('Completion is a grid, not a total.')
  })

  it('10 · records which primer VERSIONS went into it', () => {
    // "Why did it say that last Tuesday" has no answer without this.
    const prompt = assembleSystemPrompt({ primers, scope: {} })

    expect(prompt.primerVersions).toEqual({ costing: '1.5.0', cutting: '5.1.0' })
  })

  it('11 · is byte-identical for the same inputs in any order', () => {
    // A prompt that varies with map iteration order is a prompt nobody can reproduce.
    const a = assembleSystemPrompt({ primers, scope: {} })
    const b = assembleSystemPrompt({ primers: [primers[1]!, primers[0]!], scope: {} })

    expect(a.text).toBe(b.text)
  })

  it('12 · always carries the standing rules, whatever the scope', () => {
    // The things MARBIM must never do do not depend on which screen it was opened from.
    const prompt = assembleSystemPrompt({ primers: [], scope: {} })

    expect(prompt.text).toMatch(/never/i)
    expect(prompt.text).toContain('pending')
  })

  it('13 · refuses a primer with no version', () => {
    expect(() =>
      assembleSystemPrompt({
        primers: [{ moduleId: 'x', version: '', text: 'hi' }],
        scope: {},
      }),
    ).toThrow(MarbimError)
  })
})

describe('scopeToolDefaults · what the client’s context is allowed to do', () => {
  it('14 · fills a tool’s scoped arguments from the current record', () => {
    const defaults = scopeToolDefaults(
      { orderId: '11111111-1111-1111-1111-111111111111', moduleId: 'orders' },
      ['orderId', 'styleCode'],
    )
    expect(defaults).toEqual({ orderId: '11111111-1111-1111-1111-111111111111' })
  })

  it('15 · never injects a companyId from the client', () => {
    // Tenancy comes from the session, never from something a browser sent. A client-supplied
    // company scope is the whole ballgame.
    const defaults = scopeToolDefaults(
      {
        orderId: '11111111-1111-1111-1111-111111111111',
        companyId: '22222222-2222-2222-2222-222222222222',
      } as Record<string, string>,
      ['orderId', 'companyId'],
    )

    expect(defaults.companyId).toBeUndefined()
    expect(defaults.orderId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('16 · ignores a context key the tool did not ask for', () => {
    const defaults = scopeToolDefaults({ orderId: 'o-1', secretThing: 'x' }, ['orderId'])
    expect(defaults).toEqual({ orderId: 'o-1' })
  })

  it('17 · refuses a context value that is not a plain scalar', () => {
    expect(() =>
      scopeToolDefaults({ orderId: { nested: true } } as unknown as Record<string, string>, [
        'orderId',
      ]),
    ).toThrow(MarbimError)
  })
})

describe('redactForPrompt · what never reaches a model', () => {
  it('18 · strips an obvious secret', () => {
    const text = redactForPrompt('key is sk-ant-api03-abcdefghijklmnop and the PO is 4471')

    expect(text).not.toContain('sk-ant-api03-abcdefghijklmnop')
    expect(text).toContain('4471')
  })

  it('19 · leaves ordinary factory text alone', () => {
    // Over-redaction is its own failure: a prompt with the style code scrubbed out is a
    // prompt that cannot answer the question.
    const original = 'Order PO-9912, style ST-100, 12,000 pcs, ex-factory 2026-11-15'
    expect(redactForPrompt(original)).toBe(original)
  })

  it('20 · keeps Bengali text intact', () => {
    // Bengali I/O passthrough is in the brief. A redactor that mangles non-Latin script
    // would silently make the whole feature useless for the people using it.
    const bengali = 'কাটিং শুরু হয়েছে ১৫ তারিখে'
    expect(redactForPrompt(bengali)).toBe(bengali)
  })
})

/**
 * `validateToolPack` had no vectors, and a sabotage pass proved it: removing the companyId
 * ban left every test green. That check is the tenancy wall for the whole tool surface —
 * a tool whose `companyId` a client may fill in is a tool that reads another factory's book.
 */
describe('validateToolPack · what a module may offer a model', () => {
  const read = (over: Partial<ReadTool> = {}): ReadTool => ({
    kind: 'read',
    name: 'orders.find_by_po',
    description: 'Find an order by its PO number.',
    input: z.object({ po: z.string() }),
    execute: async () => ({}),
    ...over,
  })

  const registered = { pendingTargets: ['order_breakdowns'] }

  it('21 · accepts a well-formed pack', () => {
    expect(() =>
      validateToolPack({ moduleId: 'orders', tools: [read()] }, registered),
    ).not.toThrow()
  })

  it('22 · REFUSES a tool whose companyId the client may fill in', () => {
    // The one that matters. Tenancy comes from the session and nowhere else.
    expect(() =>
      validateToolPack(
        { moduleId: 'orders', tools: [read({ scopedArgs: ['orderId', 'companyId'] })] },
        registered,
      ),
    ).toThrow(/companyId/)
  })

  it('23 · refuses a tool that is not namespaced to its own module', () => {
    // Two modules registering `find` would shadow each other in load order.
    expect(() =>
      validateToolPack({ moduleId: 'orders', tools: [read({ name: 'find_by_po' })] }, registered),
    ).toThrow(/namespaced/)
  })

  it('24 · refuses the same tool name twice', () => {
    expect(() =>
      validateToolPack({ moduleId: 'orders', tools: [read(), read()] }, registered),
    ).toThrow(/twice/)
  })

  it('25 · refuses an empty description — a model picks tools by these words', () => {
    expect(() =>
      validateToolPack({ moduleId: 'orders', tools: [read({ description: '  ' })] }, registered),
    ).toThrow(/description/)
  })

  it('26 · refuses a draft tool aimed at a table the module never registered', () => {
    // `propose` would refuse it at runtime; catching it at load means the mistake is found
    // by whoever made it rather than by a model doing something surprising in production.
    const draft: DraftTool = {
      kind: 'draft',
      name: 'orders.draft_revision',
      description: 'Propose a breakdown revision.',
      input: z.object({}),
      targetTable: 'orders',
      execute: async () => {
        throw new Error('not called')
      },
    }
    expect(() => validateToolPack({ moduleId: 'orders', tools: [draft] }, registered)).toThrow(
      /has not registered as a pending target/,
    )
  })
})
