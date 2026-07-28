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

const fakeJob = (task: ScheduledTask) => ({ data: { task } }) as Job<{ task: ScheduledTask }>

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

  it('a double fire enqueues nothing extra — the job id is deterministic', async () => {
    const derive = getQueue(QUEUE.derive)
    await derive.drain()

    await fanOutScheduledTask(fakeJob('commercial.lc_countdown'))
    const after1 = (await derive.getJobs(['waiting', 'delayed', 'prioritized'])).length

    // Clock adjustment, or two workers racing a restart.
    await fanOutScheduledTask(fakeJob('commercial.lc_countdown'))
    const after2 = (await derive.getJobs(['waiting', 'delayed', 'prioritized'])).length

    expect(after2).toBe(after1)
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
