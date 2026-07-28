/**
 * Transactional outbox (architecture §1.4, §5).
 *
 * `emit` takes the caller's transaction handle rather than opening its own, and that is
 * the entire point: the event row and the data change commit or roll back together. No
 * dual write, so an event can never exist without its change and a change can never
 * silently fail to emit.
 *
 * Delivery is at-least-once by design. Consumers dedupe on the event id through
 * `markProcessed`, which is why `processed_events` is keyed by (event, queue) — the same
 * event fans out to several queues and each dedupes independently.
 */
import { sql } from 'drizzle-orm'

import { outbox as outboxTable, processedEvents } from '@/db/schema/core'

import type { AnyCtx } from './ctx'
import type { TenantDb } from './tenancy'

export interface OutboxEvent {
  /** Dotted name from the owning module's events.ts, e.g. 'orders.milestone.slipped'. */
  eventName: string
  payload: Record<string, unknown>
  aggregateTable?: string
  aggregateId?: string
}

/**
 * Append an event inside the caller's transaction. Returns the event id, which is also
 * the idempotency key consumers dedupe on.
 */
export async function emit(ctx: AnyCtx, tx: TenantDb, event: OutboxEvent): Promise<string> {
  const [row] = await tx
    .insert(outboxTable)
    .values({
      companyId: ctx.companyId,
      eventName: event.eventName,
      payload: event.payload,
      aggregateTable: event.aggregateTable ?? null,
      aggregateId: event.aggregateId ?? null,
    })
    .returning({ id: outboxTable.id })

  if (!row) throw new Error(`outbox insert returned nothing for ${event.eventName}`)
  return row.id
}

/**
 * Consumer-side dedupe. Returns false when this event has already been processed by this
 * queue, in which case the handler must return without re-applying anything.
 *
 * Called inside the handler's own transaction so that "marked processed" and "did the
 * work" share a fate — marking first and then crashing would drop the event silently.
 */
export async function markProcessed(
  tx: TenantDb,
  eventId: string,
  queue: string,
): Promise<boolean> {
  const inserted = await tx
    .insert(processedEvents)
    .values({ eventId, queue })
    .onConflictDoNothing()
    .returning({ eventId: processedEvents.eventId })

  return inserted.length > 0
}

/**
 * Claim a batch of unpublished events for the relay.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes running more than one relay worker safe: each
 * takes a disjoint batch instead of two workers fighting over the same rows. Ordered by
 * `occurred_at` so a consumer sees a company's events in the order they happened.
 *
 * ⚠ The BullMQ half of the relay lands with the worker processors; this is the query it
 * will use.
 */
export async function claimUnpublished(
  tx: TenantDb,
  limit = 100,
): Promise<{ id: string; eventName: string; payload: Record<string, unknown> }[]> {
  const result = await tx.execute<{
    id: string
    event_name: string
    payload: Record<string, unknown>
  }>(sql`
    select id, event_name, payload
    from outbox
    where published_at is null
    order by occurred_at
    limit ${limit}
    for update skip locked
  `)

  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return (rows as { id: string; event_name: string; payload: Record<string, unknown> }[]).map(
    (r) => ({ id: r.id, eventName: r.event_name, payload: r.payload }),
  )
}
