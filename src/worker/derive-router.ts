/**
 * Which handler a job on the `derive` queue belongs to.
 *
 * Two kinds of job share this queue deliberately (see `worker/index.ts`): the scheduler's
 * per-company fan-out, and the relay's cross-module event consumers. Both are "derived work
 * that must not block a request", and splitting them would double the worker count for no
 * isolation gain.
 *
 * It lives in its own file so the decision can be tested without importing the worker
 * entrypoint, which starts a process on import.
 *
 * The third case is the one this file exists for. The relay routes events to this queue by
 * PREFIX (`QUEUE_ROUTES`), and several of those prefixes have no consumer yet — documented
 * in STUBS.md as awaiting the module that will own them. Those jobs used to fall through to
 * `runDeriveTask`, which read `job.data.task` as undefined and failed with
 * `no handler for scheduled task "undefined"` plus a NOT NULL violation on `job_runs.task`.
 * That is wrong twice over: it points the reader at the scheduler for what is a missing
 * CONSUMER, and it fills the failed set and the log with retrying jobs — which is exactly
 * how a real scheduler failure gets lost in the noise.
 */
import type { Job } from 'bullmq'

import { EVENT_HANDLERS, runEventConsumer, type EventJobData } from './processors/consumers'
import { runDeriveTask, type DeriveJobData } from './processors/scheduler'

export type DeriveQueueJob = Job<DeriveJobData | EventJobData>

/** An event the relay delivered here that nothing consumes yet. */
export interface UnconsumedEvent {
  unconsumed: string
}

/**
 * Is this the scheduler's per-company fan-out rather than a relayed event?
 *
 * `runDeriveTask` reads `job.data.task` and records a run row against it, so a job without
 * one must never reach it — a NOT NULL violation on `job_runs.task` is a confusing way to
 * learn that an event had no consumer.
 */
export function isDeriveJob(job: DeriveQueueJob): job is Job<DeriveJobData> {
  return typeof (job.data as Partial<DeriveJobData>).task === 'string'
}

// Async because BullMQ's `Processor` must return a promise — the unconsumed branch does no
// work and would otherwise return a bare object.
export async function routeDeriveJob(job: DeriveQueueJob): Promise<unknown | UnconsumedEvent> {
  if (job.name in EVENT_HANDLERS) {
    return runEventConsumer(job as Job<EventJobData>)
  }

  // A scheduled fan-out carries a task in its data. Checked on the DATA rather than the
  // name: the name alone would let an event that happens to match a task name through.
  if (isDeriveJob(job)) {
    return runDeriveTask(job)
  }

  // Completed rather than failed, because there is genuinely no work to do — but named in
  // the log and in the result, so an event routed here with no consumer stays visible
  // rather than being silently dropped.
  console.warn(
    `[worker] no consumer for event "${job.name}" — the relay routes it to the derive ` +
      'queue but EVENT_HANDLERS has no entry. Add one, or stop routing it here.',
  )
  return { unconsumed: job.name }
}
