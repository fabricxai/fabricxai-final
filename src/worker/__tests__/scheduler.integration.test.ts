/**
 * Scheduler integration — against real Redis and Postgres.
 *
 * A cron that compiles is not a cron that runs. What matters here is the fan-out: the
 * right number of jobs, deterministic ids so a double-fire is a no-op, and the derive
 * handler doing real per-tenant work under RLS.
 */
import { randomUUID } from 'node:crypto'

import type { Job } from 'bullmq'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies } from '@/db/schema/core'
import { getQueue, QUEUE, closeQueues } from '@/worker/queues'
import {
  fanOutScheduledTask,
  registerSchedules,
  runDeriveTask,
  SCHEDULED_TASKS,
  type DeriveJobData,
  type ScheduledTask,
} from '@/worker/processors/scheduler'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY_A = randomUUID()
const COMPANY_B = randomUUID()
const COMPANY_INACTIVE = randomUUID()

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY_A, name: 'Sched A', slug: `sched-a-${COMPANY_A.slice(0, 8)}` },
    { id: COMPANY_B, name: 'Sched B', slug: `sched-b-${COMPANY_B.slice(0, 8)}` },
    {
      id: COMPANY_INACTIVE,
      name: 'Sched Dormant',
      slug: `sched-x-${COMPANY_INACTIVE.slice(0, 8)}`,
      isActive: false,
    },
  ])
})

afterAll(async () => {
  const derive = getQueue(QUEUE.derive)
  await derive.drain()
  await derive.clean(0, 1000, 'completed')

  const schedule = getQueue(QUEUE.schedule)
  for (const task of SCHEDULED_TASKS) {
    await schedule.removeJobScheduler(task.id).catch(() => undefined)
  }

  await db.execute(sql`delete from audit_log where company_id in (${COMPANY_A}, ${COMPANY_B})`)
  for (const id of [COMPANY_A, COMPANY_B, COMPANY_INACTIVE]) {
    await db.delete(companies).where(eq(companies.id, id))
  }

  await closeQueues()
  await client.end()
})

/**
 * `timestamp` is what identifies one FIRE of a cron. Two calls with the same timestamp are
 * the same fire retried; two with different ones are two fires, and the distinction is the
 * whole basis of the fan-out's deduplication.
 */
const fakeJob = (task: ScheduledTask, timestamp = Date.now()) =>
  ({ data: { task }, timestamp }) as Job<{ task: ScheduledTask }>

describe('scheduler', () => {
  it('registers repeatable jobs idempotently', async () => {
    await registerSchedules()
    await registerSchedules() // a worker restart, or a second worker

    const schedulers = await getQueue(QUEUE.schedule).getJobSchedulers()
    const ids = schedulers.map((s) => s.key ?? s.id)

    for (const task of SCHEDULED_TASKS) {
      // Registering twice must not produce two schedules — that is how a nightly
      // digest becomes four identical emails.
      expect(ids.filter((id) => id === task.id)).toHaveLength(1)
    }
  })

  it('fans out to live companies only, skipping dormant ones', async () => {
    const derive = getQueue(QUEUE.derive)
    await derive.drain()

    const count = await fanOutScheduledTask(fakeJob('orders.tna_scan'))
    expect(count).toBeGreaterThanOrEqual(2)

    const jobs = await derive.getJobs(['waiting', 'delayed', 'prioritized'])
    const companyIds = jobs.map((job) => (job.data as DeriveJobData).companyId)

    expect(companyIds).toContain(COMPANY_A)
    expect(companyIds).toContain(COMPANY_B)
    // Deactivated tenants are not woken up every night forever.
    expect(companyIds).not.toContain(COMPANY_INACTIVE)
  })

  it('the SAME fire enqueues nothing extra — the job id is deterministic', async () => {
    const derive = getQueue(QUEUE.derive)
    await derive.drain()

    const firedAt = Date.parse('2026-03-10T02:00:00Z')

    await fanOutScheduledTask(fakeJob('commercial.lc_countdown', firedAt))
    const after1 = (await derive.getJobs(['waiting', 'delayed', 'prioritized'])).length

    // The same scheduled job, retried after a worker died mid-fan-out.
    await fanOutScheduledTask(fakeJob('commercial.lc_countdown', firedAt))
    const after2 = (await derive.getJobs(['waiting', 'delayed', 'prioritized'])).length

    expect(after1).toBeGreaterThan(0)
    expect(after2).toBe(after1)
  })

  it('a SUB-DAILY task enqueues every fire, not just the first of the day', async () => {
    const derive = getQueue(QUEUE.derive)
    await derive.drain()

    // Two fires of the five-minute extraction runner, twenty minutes apart on one day.
    await fanOutScheduledTask(
      fakeJob('marbim.run_extractions', Date.parse('2026-03-10T08:00:00Z')),
    )
    const afterFirst = (await derive.getJobs(['waiting', 'delayed', 'prioritized'])).length

    await fanOutScheduledTask(
      fakeJob('marbim.run_extractions', Date.parse('2026-03-10T08:20:00Z')),
    )
    const afterSecond = (await derive.getJobs(['waiting', 'delayed', 'prioritized'])).length

    // Keyed on the calendar date, the second fire and the 286 after it would have been
    // dropped as duplicates — the task would have run once a day and looked fine.
    expect(afterSecond).toBe(afterFirst * 2)
  })

  it('every registered task has a cron pattern and a handler', async () => {
    // The compiler already enforces the handler side. This catches the other direction: a
    // task added to the array with a pattern that does not parse would register a schedule
    // that never fires, and nothing else would notice.
    for (const task of SCHEDULED_TASKS) {
      expect(task.pattern).toMatch(/^[\d*/,\- ]+$/)
      expect(task.pattern.trim().split(/\s+/)).toHaveLength(5)
    }
  })

  it('the derive handler runs the real per-tenant job', async () => {
    const result = (await runDeriveTask({
      id: 'test-job',
      data: { companyId: COMPANY_A, task: 'orders.tna_scan' },
    } as Job<DeriveJobData>)) as { scanned: number }

    // Company A has no milestones, so zero scanned is the correct answer — what is being
    // asserted is that it ran, scoped, without throwing.
    expect(result.scanned).toBe(0)
  })

  it('refuses an unknown task instead of silently doing nothing every night', async () => {
    await expect(
      runDeriveTask({
        id: 'test-job',
        data: { companyId: COMPANY_A, task: 'orders.nonexistent' as ScheduledTask },
      } as Job<DeriveJobData>),
    ).rejects.toThrow(/no handler/i)
  })
})
