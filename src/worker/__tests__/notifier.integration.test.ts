/**
 * The `notify` queue — that events routed there actually reach a person.
 *
 * The failure this guards is the one the queue shipped with: it was the relay's DEFAULT
 * route and had no worker, so every event not explicitly sent to `derive` arrived and
 * stopped. Nothing errored, nothing retried, nothing appeared in a failed set — a roll
 * failing 4-point inspection was a committed fact that reached nobody.
 */
import { randomUUID } from 'node:crypto'

import type { Job } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, notifications, users } from '@/db/schema/core'
import { missingKeys } from '@/lib/i18n'
import { NOTIFY_RULES, runNotifyJob, type NotifyJobData } from '@/worker/processors/notifier'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const USER = `ntf-${randomUUID().slice(0, 8)}`

const job = (name: string, payload: Record<string, unknown>): Job<NotifyJobData> =>
  ({ name, data: { eventId: randomUUID(), companyId: COMPANY, payload } }) as Job<NotifyJobData>

beforeAll(async () => {
  await db.insert(companies).values({ id: COMPANY, name: 'Ntf Co', slug: `ntf-${COMPANY.slice(0, 8)}` })
  await db.insert(users).values({ id: USER, email: `${USER}@fabricxai.test`, name: 'Notified' })
})

afterAll(async () => {
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(users).where(eq(users.id, USER))
  await client.end()
})

describe('the notify queue', () => {
  it('every rule points at a title key that exists in both catalogues', () => {
    // A notification whose title key is absent renders as the key itself — and these are
    // the messages that leave the system as email, to somebody outside it.
    const keys = Object.values(NOTIFY_RULES)
      .map((rule) => rule({}, 'test-event'))
      .filter((spec): spec is NonNullable<typeof spec> => spec !== null)
      .map((spec) => spec.titleKey)

    expect(missingKeys(keys)).toEqual([])
  })

  it('turns a rejected roll into something the STORE is told', async () => {
    const result = await runNotifyJob(
      job('quality.fabric.rejected', {
        fabricInspectionId: randomUUID(),
        pointsPer100SqYd: '31.40',
        threshold: '20.00',
      }),
    )

    expect(result.notified).toBe('quality.fabric.rejected')

    const [row] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.companyId, COMPANY), eq(notifications.kind, 'quality.fabric.rejected')))

    // The store, not quality. Quality raised it and already knows; the store is holding a
    // roll it can no longer issue.
    expect(row?.role).toBe('store')
    expect(row?.params).toMatchObject({ pointsPer100SqYd: '31.40' })
  })

  it('does not tell anybody twice about the same fact', async () => {
    const inspectionId = randomUUID()
    const payload = { finalInspectionId: inspectionId, lotQty: 24000, sampleSize: 315 }

    // Two DIFFERENT deliveries of the same fact — a redelivery after a crash, or the same
    // lot re-emitted. The dedupe key is the entity, not the event id, so both are one.
    await runNotifyJob(job('quality.final.failed', payload))
    await runNotifyJob(job('quality.final.failed', payload))

    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.companyId, COMPANY), eq(notifications.kind, 'quality.final.failed')))

    expect(rows).toHaveLength(1)
  })

  it('completes quietly for an event nobody needs to hear about', async () => {
    // Most events exist so a screen can be rebuilt. An unmapped one is not an error — the
    // same treatment the derive router gives an unconsumed event.
    const result = await runNotifyJob(job('quality.inline.recorded', { lineId: randomUUID() }))

    expect(result.notified).toBeNull()
  })
})
