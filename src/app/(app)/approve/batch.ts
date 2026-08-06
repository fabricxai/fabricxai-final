/**
 * Approving a selection, and saying honestly what happened to it (plan 3.4).
 *
 * Pulled out of `inbox-client.tsx` so it can be tested. The bug this file exists to prevent
 * is a counting bug, and a counting bug in a component with no test infrastructure is a bug
 * that gets reintroduced: the batch treated every settled promise as an approval, so ten
 * drafts under a two-approver rule reported "10 approved" with nothing committed and all ten
 * still sitting in the queue. `ApproveResult` warns about exactly this — "a caller that
 * treats a null as success would report a two-approver change as done on the first click" —
 * and the batch path was that caller.
 */

/** What happened to one row. `awaiting` is deliberately not `committed`. */
export type RowOutcome<T> =
  | { kind: 'committed'; row: T }
  | { kind: 'awaiting'; row: T; remaining: number }
  | { kind: 'failed'; row: T; message: string }

/**
 * How many approvals run at once.
 *
 * Not unbounded. Each `approve` holds a transaction for its whole commit — re-validation,
 * the module's own write, the audit row, the outbox event — and PgBouncer runs a pool of 25
 * in transaction mode. A reviewer selecting all sixty drafts and clicking once would take
 * every connection in the factory and put the cutting floor's next scan behind them. Four is
 * still parallel and leaves the pool to everybody else.
 */
export const BATCH_CONCURRENCY = 4

/**
 * Run `work` over `items`, at most `limit` in flight, results in input order.
 *
 * `work` is expected to catch its own failures and return an outcome — `Promise.all` over
 * the workers means one rejection would abandon the rest mid-flight, which is the opposite
 * of what a partial-failure path is for.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export interface BatchSummary {
  committed: number
  awaiting: number
  failed: number
  /** The toast line. Never says "approved" — see below. */
  headline: string
}

/**
 * Count the outcomes, and word them so nothing is claimed that did not happen.
 *
 * "Committed" rather than "approved" throughout, because on a multi-approver rule those are
 * different facts and only one of them means the row was written. A clause is omitted rather
 * than shown as zero: "12 committed · 0 refused" invites somebody to read the zero as the
 * interesting number.
 */
export function summariseBatch<T>(outcomes: readonly RowOutcome<T>[]): BatchSummary {
  const committed = outcomes.filter((o) => o.kind === 'committed').length
  const awaiting = outcomes.filter((o) => o.kind === 'awaiting').length
  const failed = outcomes.filter((o) => o.kind === 'failed').length

  const headline = [
    `${committed} committed`,
    awaiting > 0 ? `${awaiting} waiting on another signature` : '',
    failed > 0 ? `${failed} refused` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return { committed, awaiting, failed, headline }
}

/**
 * What should stay selected after a batch.
 *
 * Everything that did not commit — both refusals and drafts waiting on a colleague. Trying
 * again is then one click, and it can never re-approve something that already went through.
 * The old code cleared the selection BEFORE the work started, so a partial failure left the
 * reviewer to pick the failed rows out of a list of forty by hand.
 */
export function stillSelected<T extends { id: string }>(
  outcomes: readonly RowOutcome<T>[],
): string[] {
  return outcomes.filter((o) => o.kind !== 'committed').map((o) => o.row.id)
}
