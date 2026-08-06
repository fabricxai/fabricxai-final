/**
 * Batch approve (plan 3.4).
 *
 * The batch button is the only place in this product that fans one click out into dozens of
 * writes, and everything that made it wrong was arithmetic rather than rendering — which is
 * why the arithmetic now lives in a module a test can reach.
 *
 * The headline case is `awaiting`. `approveDraft` returns `awaiting_approvals` when a draft
 * is short of the signatures its rule demands, and the batch counted every settled promise
 * as an approval: ten drafts under a two-approver rule reported "10 approved" with nothing
 * committed and all ten still in the queue. `ApproveResult` documents that trap in as many
 * words — "a caller that treats a null as success would report a two-approver change as
 * done on the first click" — and this was that caller.
 */
import { describe, expect, it } from 'vitest'

import {
  BATCH_CONCURRENCY,
  mapWithLimit,
  stillSelected,
  summariseBatch,
  type RowOutcome,
} from '../batch'

interface Row {
  id: string
  title: string
}

const row = (id: string): Row => ({ id, title: `Draft ${id}` })

const committed = (id: string): RowOutcome<Row> => ({ kind: 'committed', row: row(id) })
const awaiting = (id: string, remaining = 1): RowOutcome<Row> => ({
  kind: 'awaiting',
  row: row(id),
  remaining,
})
const failed = (id: string, message = 'gate refused'): RowOutcome<Row> => ({
  kind: 'failed',
  row: row(id),
  message,
})

describe('what the batch says happened', () => {
  it('never calls a draft waiting on a colleague approved', () => {
    // The regression. Every one of these is a recorded approval and NONE of them wrote a
    // row; reporting "10 approved" would tell a reviewer their afternoon is finished.
    const summary = summariseBatch([...Array(10)].map((_, i) => awaiting(`d${i}`)))

    expect(summary.committed).toBe(0)
    expect(summary.awaiting).toBe(10)
    expect(summary.headline).toBe('0 committed · 10 waiting on another signature')
    expect(summary.headline).not.toContain('approved')
  })

  it('counts the three outcomes separately', () => {
    const summary = summariseBatch([
      committed('a'),
      committed('b'),
      awaiting('c'),
      failed('d'),
      failed('e'),
    ])

    expect(summary).toMatchObject({ committed: 2, awaiting: 1, failed: 2 })
    expect(summary.headline).toBe(
      '2 committed · 1 waiting on another signature · 2 refused',
    )
  })

  it('says nothing about the outcomes that did not happen', () => {
    // "12 committed · 0 refused" invites somebody to read the zero as the interesting
    // number. A clause that would be zero is omitted rather than shown.
    const clean = summariseBatch([committed('a'), committed('b')])

    expect(clean.headline).toBe('2 committed')
    expect(clean.headline).not.toContain('0')
  })

  it('reports an empty batch as nothing rather than as a success', () => {
    expect(summariseBatch([]).headline).toBe('0 committed')
  })
})

describe('what stays selected', () => {
  it('keeps everything that did not commit, so trying again is one click', () => {
    const kept = stillSelected([committed('a'), awaiting('b'), failed('c'), committed('d')])

    expect(kept).toEqual(['b', 'c'])
  })

  it('never leaves a committed row selected', () => {
    /*
     * The property that matters more than the convenience. The selection is what a retry
     * re-submits, and a committed draft re-submitted is a 409 at best — at worst it is a
     * reviewer being told their retry failed for a row that was fine all along.
     */
    const outcomes = [committed('a'), committed('b'), committed('c')]

    expect(stillSelected(outcomes)).toEqual([])
  })
})

describe('running the batch', () => {
  it('keeps results in the order the rows were listed', async () => {
    // The outcomes are rendered against their rows by index. Out-of-order results would
    // name the wrong draft in a refusal, which is worse than no refusal at all.
    const items = [10, 40, 20, 5, 30]

    const out = await mapWithLimit(items, 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n))
      return n
    })

    expect(out).toEqual(items)
  })

  it('never runs more than the limit at once', async () => {
    // Each approve holds a transaction, and PgBouncer pools 25 of them for the whole
    // factory. A "select all" that fans out unbounded stalls every other screen.
    let inFlight = 0
    let peak = 0

    await mapWithLimit([...Array(20)].map((_, i) => i), BATCH_CONCURRENCY, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return null
    })

    expect(peak).toBe(BATCH_CONCURRENCY)
  })

  it('processes every item even when there are fewer than the limit', async () => {
    const out = await mapWithLimit([1, 2], BATCH_CONCURRENCY, async (n) => n * 2)

    expect(out).toEqual([2, 4])
  })

  it('does nothing at all for an empty selection', async () => {
    let called = 0
    const out = await mapWithLimit([], BATCH_CONCURRENCY, async () => {
      called += 1
      return null
    })

    expect(out).toEqual([])
    expect(called).toBe(0)
  })
})
