/**
 * Outbox relay — the only bridge from committed transactions to BullMQ
 * (architecture §1.4, §5).
 *
 * The ordering here is the whole design and it is easy to get subtly wrong:
 *
 *   BEGIN
 *     lock a batch of undelivered rows      (FOR UPDATE SKIP LOCKED)
 *     enqueue them to BullMQ
 *     mark them published
 *   COMMIT
 *
 * Marking published *before* the enqueue would make delivery at-most-once: a crash in
 * between loses the event permanently and silently. Marking after, inside the same
 * transaction, means a crash rolls the claim back and the event is retried. A crash
 * between enqueue and commit redelivers — which is exactly the at-least-once contract
 * handlers already dedupe against via `processed_events`.
 *
 * `SKIP LOCKED` is what makes running several relay workers safe: each takes a disjoint
 * batch instead of two fighting over the same rows.
 */
import { sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { env } from '@/lib/env'

import { getQueue, QUEUE, type QueueName } from '../queues'

const BATCH_SIZE = 100
/** After this many failures an event stops being retried and waits for a human. */
const MAX_ATTEMPTS = 10

interface OutboxRow extends Record<string, unknown> {
  id: string
  company_id: string
  event_name: string
  payload: Record<string, unknown>
  attempts: number
}

/**
 * Which queue an event lands on. Events are named `<module>.<aggregate>.<verb>`; for now
 * everything fans out to `notify`, and modules refine this as their job families land.
 */
function queueFor(_eventName: string): QueueName {
  return QUEUE.notify
}

export async function relayOnce(batchSize = BATCH_SIZE): Promise<{ relayed: number }> {
  return db.transaction(async (tx) => {
    // Cross-tenant by necessity — one queue spans every company. Goes through the
    // narrow SECURITY DEFINER function from migration 0006, which can only ever see
    // undelivered rows.
    const result = await tx.execute<OutboxRow>(
      sql`select * from app.lock_outbox_batch(${batchSize})`,
    )
    const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as OutboxRow[]

    if (rows.length === 0) return { relayed: 0 }

    const delivered: string[] = []

    for (const row of rows) {
      if (row.attempts >= MAX_ATTEMPTS) {
        // Poison event. Leave it unpublished with its error so it shows up in the admin
        // runbook screen rather than being retried until the end of time.
        continue
      }

      try {
        await getQueue(queueFor(row.event_name)).add(
          row.event_name,
          { eventId: row.id, companyId: row.company_id, payload: row.payload },
          // BullMQ-side dedupe as well as the DB one: a redelivery after a crash between
          // enqueue and commit must not create a second job.
          { jobId: row.id },
        )
        delivered.push(row.id)
      } catch (error) {
        await tx.execute(
          sql`select app.record_outbox_failure(${row.id}, ${String(error)})`,
        )
      }
    }

    if (delivered.length > 0) {
      // Bound as a single array-literal parameter, not as a template list: drizzle
      // expands a JS array into a comma-separated tuple, which Postgres reads as a
      // record and refuses to cast to uuid[].
      const idList = `{${delivered.join(',')}}`
      await tx.execute(sql`select app.mark_outbox_published(${idList}::uuid[])`)
    }

    return { relayed: delivered.length }
  })
}

/**
 * Poll loop. Deliberately a poll rather than LISTEN/NOTIFY: NOTIFY does not survive
 * PgBouncer's transaction pooling, and a one-second floor on event latency is irrelevant
 * next to the extraction and digest work these events trigger.
 */
export function startOutboxRelay(intervalMs = 1_000): { stop: () => void } {
  let running = true
  let inFlight = false

  const timer = setInterval(() => {
    if (!running || inFlight) return
    inFlight = true

    relayOnce()
      .then(({ relayed }) => {
        if (relayed > 0) console.log(`[relay] delivered ${relayed} event(s)`)
      })
      .catch((error: unknown) => {
        console.error('[relay] batch failed:', error)
      })
      .finally(() => {
        inFlight = false
      })
  }, intervalMs)

  // Do not hold the process open on this timer alone.
  timer.unref?.()

  return {
    stop: () => {
      running = false
      clearInterval(timer)
    },
  }
}

export const RELAY_CONCURRENCY = env.WORKER_CONCURRENCY
