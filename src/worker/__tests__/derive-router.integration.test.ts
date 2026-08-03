/**
 * Which handler a `derive` job goes to.
 *
 * The failure being guarded: the relay routes events to this queue by prefix, and several
 * of those prefixes have no consumer yet (STUBS.md). Those jobs fell through to the
 * scheduler's handler, which read `job.data.task` as undefined and failed with
 * `no handler for scheduled task "undefined"` — a message that sends the reader to the
 * scheduler for a missing CONSUMER, while filling the failed set with retries that would
 * bury a real scheduler failure.
 *
 * The decision itself is pure, but reaching it imports the consumer and scheduler families
 * (and through them the db client, which validates the environment at import), so it runs
 * with the integration suite rather than the unit one.
 */
import { describe, expect, it, vi } from 'vitest'

import { isDeriveJob, routeDeriveJob, type DeriveQueueJob } from '../derive-router'
import { EVENT_HANDLERS } from '../processors/consumers'
import { queueForEvent } from '../processors/outbox-relay'
import { QUEUE } from '../queues'

const job = (name: string, data: unknown): DeriveQueueJob =>
  ({ name, data, id: 'test-job' }) as DeriveQueueJob

/**
 * An event the relay routes here that nothing consumes.
 *
 * Deliberately a real event name rather than a made-up one, so the test exercises the
 * actual gap. The assertion below pins the premise — see the note there.
 */
const UNCONSUMED = 'planning.allocation.created'

describe('isDeriveJob · scheduled fan-out or relayed event', () => {
  it('a fan-out carries the task in its data', () => {
    expect(isDeriveJob(job('orders.tna_scan', { companyId: 'c1', task: 'orders.tna_scan' }))).toBe(
      true,
    )
  })

  it('an event does not, however its job is named', () => {
    // Decided on the DATA, not the name: an event whose name happened to match a task
    // would otherwise reach the scheduler's handler.
    expect(isDeriveJob(job('orders.tna_scan', { companyId: 'c1', eventId: 'e1' }))).toBe(false)
    expect(isDeriveJob(job(UNCONSUMED, { companyId: 'c1', eventId: 'e1' }))).toBe(false)
  })
})

describe('routeDeriveJob · an event with no consumer', () => {
  it('the event this file tests with genuinely has no consumer', () => {
    // Guards the test below. It used to use `quality.final.passed`, which later GAINED a
    // consumer — so the "unconsumed" case quietly started exercising the handler path and
    // failed on the fake company id rather than on anything real. Asserting the premise
    // turns that into an obvious failure here instead of a confusing one there.
    expect(EVENT_HANDLERS[UNCONSUMED]).toBeUndefined()
  })

  it('completes it as unconsumed rather than failing it as a broken scheduler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Routed to the derive queue by the relay with no entry in EVENT_HANDLERS — the exact
    // shape that produced 36 failed jobs.
    const result = await routeDeriveJob(job(UNCONSUMED, { companyId: 'c1', eventId: 'e1' }))

    expect(result).toEqual({ unconsumed: UNCONSUMED })

    // Visible, not silent: an event routed here with no consumer is still a gap somebody
    // has to close, it is just not an outage.
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain(UNCONSUMED)
    warn.mockRestore()
  })

  it('names the event, not a scheduled task', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await routeDeriveJob(job('sampling.pp_approved', { companyId: 'c1', eventId: 'e1' }))

    const message = String(warn.mock.calls[0]![0])
    expect(message).toContain('no consumer for event')
    expect(message).not.toContain('scheduled task')
    warn.mockRestore()
  })
})

/**
 * Every consumer must have a route to the queue that runs it.
 *
 * The failure this guards is silent in both directions. A handler with no route never
 * fires — the event goes to `notify`, which does not run consumers — and nothing errors,
 * nothing retries, nothing appears in a failed set. `production.downtime.machine` and
 * `orders.order.status_changed` both sat like that: registered, tested in isolation, and
 * wired to nothing.
 *
 * `EVENT_HANDLERS` and the relay's routing table are edited in different files by different
 * changes, so nothing but an assertion keeps them in step.
 */
describe('every consumer is routed to the derive queue', () => {
  it('has no handler the relay would send somewhere else', () => {
    const unrouted = Object.keys(EVENT_HANDLERS).filter(
      (name) => queueForEvent(name) !== QUEUE.derive,
    )

    expect(unrouted).toEqual([])
  })
})
