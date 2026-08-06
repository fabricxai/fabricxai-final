/**
 * Scheduled work for X.2 — the runner that makes `queueExtraction` mean something.
 *
 * Until this existed, queueing an extraction wrote a row and nothing ever ran it.
 *
 * ## Why it checks for a provider first
 *
 * `runExtraction` treats a missing provider as a NON-retryable failure, which is correct in
 * isolation: an unconfigured model will still be unconfigured on the next attempt, and a
 * queue that retries it forever never drains.
 *
 * But a poller that ran anyway would walk the whole backlog on its first pass and mark every
 * queued extraction `rejected` — permanently, since rejected is terminal. A factory that
 * uploaded fifty tech packs before anybody set up a key would lose all fifty, and the system
 * would look like it had processed them.
 *
 * So the job asks once, up front, and does nothing if there is no provider. That is the
 * whole difference between degrading loudly and destroying work.
 */
import type { SystemCtx } from '../core/ctx'

import { hasProvider } from './provider'
import { retryableJobs, runExtraction, type MarbimPolicy } from './service'

export interface ExtractionRunResult {
  picked: number
  succeeded: number
  failed: number
  rejected: number
  /** Set when nothing ran, with the reason. */
  skipped?: string
}

/** How many extractions one pass will run, so a backlog cannot monopolise the worker. */
const BATCH = 10

/**
 * The safety net, not the mechanism (plan 6.6, audit AI-M4).
 *
 * Since `marbim.extraction.queued` routes to the derive queue, the common case runs within
 * seconds of somebody pressing the button. This still runs every five minutes, and it should:
 * it picks up what an event cannot — a retryable failure waiting for its next attempt, a job
 * queued while the worker was down, an event lost between the outbox and Redis.
 *
 * The two can overlap. `runExtraction` re-reads the row and returns early when it is no
 * longer `queued` or `failed`, so whichever gets there second does nothing.
 */
export async function runQueuedExtractions(
  ctx: SystemCtx,
  policy: MarbimPolicy,
): Promise<ExtractionRunResult> {
  if (!hasProvider()) {
    // Not an error, and deliberately not a rejection of the backlog: the work is still
    // there, still queued, and will run when a provider is configured.
    return { picked: 0, succeeded: 0, failed: 0, rejected: 0, skipped: 'no MARBIM provider is registered' }
  }

  const pending = (await retryableJobs(ctx, policy)).slice(0, BATCH)

  const result: ExtractionRunResult = { picked: pending.length, succeeded: 0, failed: 0, rejected: 0 }

  for (const job of pending) {
    // One bad document must not stop the rest of the batch. `runExtraction` records its own
    // failure on the row, so anything thrown here is unexpected and worth surfacing.
    const outcome = await runExtraction(ctx, { jobId: job.id }, policy)
    if (outcome.status === 'succeeded') result.succeeded += 1
    else if (outcome.status === 'failed') result.failed += 1
    else result.rejected += 1
  }

  return result
}
