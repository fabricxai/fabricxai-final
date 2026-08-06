/**
 * The tool execution loop and the history budget (plan 6.5, audit AI-B3/AI-H3/AI-H6).
 *
 * `runToolCalls` takes its runner as a parameter precisely so this can exist: the validation,
 * the refusals and the shape of what goes back to the model are all testable without a
 * database or a provider, and they are the parts where a mistake lets a model reach something
 * it should not.
 */
import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import { budgetedHistory, runToolCalls, MAX_TOOL_ITERATIONS } from '../loop'
import type { RequestCtx } from '../../core/ctx'
import type { DraftTool, ModuleTool, ReadTool } from '../tools'

const ctx = { companyId: 'c1', userId: 'u1', roles: ['merchandiser'] } as unknown as RequestCtx

const readTool = (
  name: string,
  execute: ReadTool['execute'] = vi.fn(async () => ({ ok: true })),
): ReadTool => ({
  kind: 'read',
  name,
  description: 'reads',
  input: z.object({ orderId: z.string() }),
  execute,
})

const draftTool = (name: string): DraftTool => ({
  kind: 'draft',
  name,
  description: 'drafts',
  targetTable: 'stock_adjustments',
  input: z.object({ qty: z.string() }),
  execute: vi.fn(),
})

/**
 * A runner that only EXECUTES.
 *
 * It does no validation, deliberately — `runToolCalls` owns that now, and a test runner that
 * quietly re-parsed would hide the very regression case 4 exists for.
 */
const runner = () => ({
  read: vi.fn(async (_c: unknown, tool: ModuleTool, args: unknown) =>
    (tool as ReadTool).execute(_c as never, args as never),
  ),
  draft: vi.fn(async (_c: unknown, _t: unknown, _a: unknown, _m: string) => ({
    pendingChangeId: 'pc-1',
  })),
})

const scope = (tools: ModuleTool[]) => ({
  tools,
  moduleOf: (name: string) => name.split('.')[0],
})

describe('runToolCalls · a model is an untrusted client that happens to be helpful', () => {
  it('1 · runs a read and hands the result back', async () => {
    const tool = readTool('orders.book')
    const run = runner()

    const result = await runToolCalls(
      ctx,
      [{ id: 't1', name: 'orders.book', args: { orderId: 'o1' } }],
      scope([tool]),
      run,
    )

    expect(run.read).toHaveBeenCalledOnce()
    expect(result.executed[0]).toMatchObject({ name: 'orders.book', ok: true })
    expect(result.results[0]!.id).toBe('t1')
    expect(result.results[0]!.isError).toBeUndefined()
  })

  it('2 · refuses a tool the model invented, and tells it so', async () => {
    /*
     * The refusal goes back INTO the conversation rather than throwing. A model told "no such
     * tool" can say it could not look; a model whose turn died gets a 500 and the person gets
     * nothing — and the model would have answered from its own knowledge either way, which is
     * the outcome worth avoiding.
     */
    const result = await runToolCalls(
      ctx,
      [{ id: 't1', name: 'orders.invented', args: {} }],
      scope([readTool('orders.book')]),
      runner(),
    )

    expect(result.executed[0]).toMatchObject({ ok: false })
    expect(result.results[0]!.isError).toBe(true)
    expect(result.results[0]!.content).toMatch(/no tool named/)
  })

  it('3 · refuses a tool outside this caller’s scope in the SAME words', async () => {
    /*
     * A payroll tool this person cannot reach must not be distinguishable from one that does
     * not exist (audit AI-H6). "That exists but you may not use it" tells the model — and
     * through it the user — the shape of what they cannot see.
     */
    const invented = await runToolCalls(
      ctx,
      [{ id: 'a', name: 'orders.nope', args: {} }],
      scope([]),
      runner(),
    )
    const forbidden = await runToolCalls(
      ctx,
      [{ id: 'b', name: 'workforce.payroll_run', args: {} }],
      scope([]),
      runner(),
    )

    expect(invented.results[0]!.content.replace('orders.nope', 'X')).toBe(
      forbidden.results[0]!.content.replace('workforce.payroll_run', 'X'),
    )
  })

  it('4 · validates args with the TOOL’s zod, not the vendor’s schema', async () => {
    /*
     * The schema handed to the model is guidance. This is the enforcement, and it is the same
     * parse a server action does on a browser's body.
     *
     * Red-tested, and it found a real weakness: with the parse living in the injected runner,
     * this test's own runner forgot it, `{wrong: 'shape'}` reached the executor, and the case
     * passed for the wrong reason. The parse moved into `runToolCalls` — a guarantee every
     * caller has to remember is not a guarantee.
     */
    const execute = vi.fn(async () => ({ ok: true }))
    const result = await runToolCalls(
      ctx,
      [{ id: 't1', name: 'orders.book', args: { wrong: 'shape' } }],
      scope([readTool('orders.book', execute)]),
      runner(),
    )

    expect(execute).not.toHaveBeenCalled()
    expect(result.executed[0]!.ok).toBe(false)
    expect(result.results[0]!.isError).toBe(true)
  })

  it('5 · one failed read does not take the other three down', async () => {
    /*
     * Failing the whole question because one of four reads timed out throws away three good
     * results and an answer worth having with a caveat. The model is told which one failed
     * and can say so.
     */
    const boom = readTool(
      'orders.detail',
      vi.fn(async () => {
        throw new Error('timeout reading orders')
      }),
    )

    const result = await runToolCalls(
      ctx,
      [
        { id: 'a', name: 'orders.book', args: { orderId: 'o1' } },
        { id: 'b', name: 'orders.detail', args: { orderId: 'o1' } },
        { id: 'c', name: 'orders.book', args: { orderId: 'o2' } },
      ],
      scope([readTool('orders.book'), boom]),
      runner(),
    )

    expect(result.executed.map((call) => call.ok)).toEqual([true, false, true])
    expect(result.results[1]!.content).toMatch(/timeout reading orders/)
  })

  it('6 · a draft goes through runDraftTool and says nothing is written yet', async () => {
    /*
     * The sentence matters as much as the routing. X.2's system prompt says MARBIM never
     * claims an action is done, and the tool result is where that would break first — a
     * model told "created" will tell a merchandiser their adjustment is made.
     */
    const run = runner()
    const result = await runToolCalls(
      ctx,
      [{ id: 't1', name: 'store.propose_stock_adjustment', args: { qty: '-40' } }],
      scope([draftTool('store.propose_stock_adjustment')]),
      run,
    )

    expect(run.draft).toHaveBeenCalledOnce()
    expect(run.draft.mock.calls[0]![3]).toBe('store')
    expect(result.pendingChangeIds).toEqual(['pc-1'])
    expect(result.results[0]!.content).toMatch(/nothing has been written yet/)
    expect(result.results[0]!.content).toMatch(/approve/)
  })

  it('7 · a draft tool never reaches the read path', async () => {
    // The whole safety argument is that `runDraftTool` is the ONLY door into
    // `pending_changes`. A draft executed as a read would route around the target whitelist,
    // the zod re-validation and the provenance check in one step.
    const run = runner()
    await runToolCalls(
      ctx,
      [{ id: 't1', name: 'store.propose_stock_adjustment', args: { qty: '-40' } }],
      scope([draftTool('store.propose_stock_adjustment')]),
      run,
    )

    expect(run.read).not.toHaveBeenCalled()
  })

  it('8 · every result is matched to the call it answers', async () => {
    // Vendors reject a `tool_result` whose id does not match a `tool_use`, and an id that
    // silently drifted would break every multi-tool turn at once.
    const result = await runToolCalls(
      ctx,
      [
        { id: 'call-a', name: 'orders.book', args: { orderId: 'o1' } },
        { id: 'call-b', name: 'orders.book', args: { orderId: 'o2' } },
      ],
      scope([readTool('orders.book')]),
      runner(),
    )

    expect(result.results.map((r) => r.id)).toEqual(['call-a', 'call-b'])
  })

  it('9 · redacts a credential that came back in a row', async () => {
    /*
     * A read tool returns rows from the factory's database and those rows go into a prompt.
     * A key pasted into a note field is a key in a row, and the question already gets this
     * treatment — the results had better too.
     */
    const leaky = readTool(
      'orders.book',
      vi.fn(async () => ({ note: 'the api key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345' })),
    )

    const result = await runToolCalls(
      ctx,
      [{ id: 't1', name: 'orders.book', args: { orderId: 'o1' } }],
      scope([leaky]),
      runner(),
    )

    expect(result.results[0]!.content).not.toMatch(/sk-ant-api03-abcdefghij/)
    expect(result.results[0]!.content).toMatch(/redacted/)
  })

  it('10 · truncates a huge result and SAYS it truncated', async () => {
    // A model reading a cut-off list and reporting a total from it is confidently wrong, and
    // has no other way to know.
    const huge = readTool(
      'orders.book',
      vi.fn(async () => ({ rows: Array.from({ length: 4000 }, (_, i) => `row-${i}`) })),
    )

    const result = await runToolCalls(
      ctx,
      [{ id: 't1', name: 'orders.book', args: { orderId: 'o1' } }],
      scope([huge]),
      runner(),
    )

    expect(result.results[0]!.content).toMatch(/truncated/)
    expect(result.results[0]!.content).toMatch(/narrower slice/)
  })
})

describe('budgetedHistory · the conversation remembers, but not forever', () => {
  const turn = (n: number, size = 10) => ({
    question: `q${n}`.padEnd(size, '.'),
    answer: `a${n}`.padEnd(size, '.'),
  })

  it('1 · replays the transcript in order, as pairs', () => {
    // `chat` sent ONE message — the current question — so "and for the blue one?" was
    // unanswerable and the conversation id recorded turns nothing ever read back.
    const messages = budgetedHistory([turn(1), turn(2)], 1_000)

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(messages[0]!.content).toMatch(/^q1/)
    expect(messages[3]!.content).toMatch(/^a2/)
  })

  it('2 · drops the OLDEST turns when the budget runs out', () => {
    // Newest-first is what keeps "and for the blue one?" answerable, which is the entire
    // reason for having history at all.
    const messages = budgetedHistory([turn(1), turn(2), turn(3)], 45)

    expect(messages.map((m) => m.content.slice(0, 2))).toEqual(['q2', 'a2', 'q3', 'a3'])
  })

  it('3 · never returns a question without its answer', () => {
    // A question whose answer was dropped reads as one MARBIM ignored — worse than not
    // carrying the turn at all.
    for (const budget of [0, 5, 19, 20, 21, 39, 40, 41, 1_000]) {
      const messages = budgetedHistory([turn(1), turn(2)], budget)
      expect(messages.length % 2, `budget ${budget}`).toBe(0)
    }
  })

  it('4 · skips a turn that was never answered', () => {
    // An unanswered turn is a failure, not context — replaying it invites the model to
    // apologise for something it never said.
    const messages = budgetedHistory(
      [{ question: 'q1', answer: null }, turn(2)],
      1_000,
    )

    expect(messages.map((m) => m.content.slice(0, 2))).toEqual(['q2', 'a2'])
  })

  it('5 · is bounded — fifty turns do not all arrive', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => turn(i, 400))
    const messages = budgetedHistory(fifty, 12_000)

    const chars = messages.reduce((sum, m) => sum + m.content.length, 0)
    expect(chars).toBeLessThanOrEqual(12_000)
    expect(messages.length).toBeLessThan(100)
  })

  it('6 · carries no tool results forward', () => {
    /*
     * Deliberate. A tool result was a snapshot of a moving factory, and re-showing yesterday's
     * WIP as though it were current is worse than not having it — the model can ask again,
     * and the answer will be true.
     */
    const messages = budgetedHistory([turn(1)], 1_000)

    expect(messages.every((m) => !m.toolResults && !m.toolCalls)).toBe(true)
  })
})

describe('the iteration cap', () => {
  it('is small enough to bound a runaway and large enough for a real chain', () => {
    // Find the order, read its breakdown, check the LC, answer. Every round is a full
    // provider call at the price of the whole transcript so far, so this is a cost ceiling
    // as much as a correctness one.
    expect(MAX_TOOL_ITERATIONS).toBeGreaterThanOrEqual(3)
    expect(MAX_TOOL_ITERATIONS).toBeLessThanOrEqual(6)
  })
})
