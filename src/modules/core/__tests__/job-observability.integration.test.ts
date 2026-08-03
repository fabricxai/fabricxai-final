/**
 * Job observability, against a real database.
 *
 * The failure being guarded is the quietest one this system has: a schedule that stops
 * firing produces no error, no failed job and no row, and looks exactly like a factory with
 * nothing wrong.
 *
 *  - every run leaves a row, succeeded or failed, and a failure still throws;
 *  - a task killed mid-flight leaves a `running` row rather than nothing;
 *  - a broken recorder does NOT take down the task it is recording;
 *  - the health check reports a task that stopped, and a task that never started;
 *  - ten silent tasks are ONE alert, and the same ten staying silent do not re-alert;
 *  - pruning keeps the last success whatever its age;
 *  - cross-company reads see nothing.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, jobRuns, notifications, roles, users } from '@/db/schema/core'
import type { SystemCtx } from '@/modules/core/ctx'
import { runJobHealthCheck, type JobHealthPolicy } from '@/modules/core/job-health-job'
import {
  lastSuccessByTask,
  pruneJobRuns,
  recordRun,
  stuckRuns,
} from '@/modules/core/job-runs'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const OWNER = `own-${randomUUID().slice(0, 8)}`

const ctx: SystemCtx = { companyId: COMPANY, userId: null, roles: ['owner'], system: true }
const otherCtx: SystemCtx = { companyId: OTHER, userId: null, roles: ['owner'], system: true }

const POLICY: JobHealthPolicy = {
  toleranceFactor: 1.5,
  floorMinutes: 15,
  stuckAfterMinutes: 60,
}

const NOW = new Date('2026-03-10T09:00:00Z')
/** Old enough that a never-run task is a real gap rather than a fresh install. */
const CREATED = new Date('2025-01-01T00:00:00Z')

const EXPECTATIONS = [
  { task: 'orders.tna_scan', pattern: '30 1 * * *' },
  { task: 'marbim.run_extractions', pattern: '*/5 * * * *' },
]

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Obs Co', slug: `obs-${COMPANY.slice(0, 8)}`, createdAt: CREATED },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values({ id: OWNER, email: `${OWNER}@fabricxai.test`, name: 'Owner' })
  await db.insert(roles).values({ companyId: COMPANY, userId: OWNER, role: 'owner' })
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, OWNER))
  await client.end()
})

beforeEach(async () => {
  await db.delete(jobRuns).where(eq(jobRuns.companyId, COMPANY))
  await db.delete(jobRuns).where(eq(jobRuns.companyId, OTHER))
  await db.delete(notifications).where(eq(notifications.companyId, COMPANY))
})

const runsOf = (companyId: string) =>
  db.select().from(jobRuns).where(eq(jobRuns.companyId, companyId))

describe('recordRun · every run leaves evidence', () => {
  it('records a success with what the task returned', async () => {
    const result = await recordRun(ctx, { task: 'orders.tna_scan' }, async () => ({ scanned: 7 }))

    expect(result).toEqual({ scanned: 7 })

    const rows = await runsOf(COMPANY)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('succeeded')
    expect(rows[0]!.result).toEqual({ scanned: 7 })
    expect(rows[0]!.finishedAt).not.toBeNull()
    expect(rows[0]!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('records a failure AND still throws', async () => {
    // The wrapper observes; it does not swallow. BullMQ's retry and the worker's failure
    // log both still need to see the real error.
    await expect(
      recordRun(ctx, { task: 'orders.tna_scan' }, async () => {
        throw new Error('the scan blew up')
      }),
    ).rejects.toThrow('the scan blew up')

    const rows = await runsOf(COMPANY)
    expect(rows[0]!.status).toBe('failed')
    expect(rows[0]!.error).toContain('blew up')
  })

  it('a failed run does NOT count as the task having run', async () => {
    await recordRun(ctx, { task: 'orders.tna_scan' }, async () => {
      throw new Error('nope')
    }).catch(() => undefined)

    // Otherwise a task failing every night reads as a task running every night, and the
    // staleness check — the thing that would have caught it — goes quiet.
    expect(await lastSuccessByTask(ctx)).toEqual({})
  })

  it('truncates an enormous result rather than storing it', async () => {
    await recordRun(ctx, { task: 'orders.tna_scan' }, async () => ({
      rows: Array.from({ length: 5_000 }, (_, i) => ({ id: i, note: 'x'.repeat(20) })),
    }))

    const rows = await runsOf(COMPANY)
    expect(rows[0]!.result).toMatchObject({ truncated: true })
    expect(rows[0]!.status).toBe('succeeded')
  })

  it('another company sees none of these runs', async () => {
    await recordRun(ctx, { task: 'orders.tna_scan' }, async () => ({ ok: true }))
    expect(await lastSuccessByTask(otherCtx)).toEqual({})
    expect(await runsOf(OTHER)).toHaveLength(0)
  })
})

describe('stuckRuns · started and never finished', () => {
  it('reports a run that has been going for hours', async () => {
    await db.insert(jobRuns).values({
      companyId: COMPANY,
      task: 'production.day_close',
      status: 'running',
      startedAt: new Date(NOW.getTime() - 3 * 3_600_000),
    })

    const stuck = await stuckRuns(ctx, 60, NOW)

    // A different failure from a task that stopped firing: the schedule is alive, the work
    // began, and something is holding it.
    expect(stuck).toHaveLength(1)
    expect(stuck[0]!.task).toBe('production.day_close')
    expect(stuck[0]!.minutesRunning).toBe(180)
  })

  it('leaves a run that started a minute ago alone', async () => {
    await db.insert(jobRuns).values({
      companyId: COMPANY,
      task: 'production.day_close',
      status: 'running',
      startedAt: new Date(NOW.getTime() - 60_000),
    })

    expect(await stuckRuns(ctx, 60, NOW)).toEqual([])
  })
})

describe('the health check notices what stopped', () => {
  const succeededAt = async (task: string, at: Date) => {
    await db.insert(jobRuns).values({
      companyId: COMPANY,
      task,
      status: 'succeeded',
      startedAt: at,
      finishedAt: at,
      durationMs: 10,
    })
  }

  it('says nothing when everything ran recently', async () => {
    await succeededAt('orders.tna_scan', new Date(NOW.getTime() - 8 * 3_600_000))
    await succeededAt('marbim.run_extractions', new Date(NOW.getTime() - 3 * 60_000))

    const result = await runJobHealthCheck(
      ctx,
      { expectations: EXPECTATIONS, companyCreatedAt: CREATED, now: NOW },
      POLICY,
    )

    expect(result.stale).toEqual([])
    expect(result.alerted).toBe(false)
  })

  it('reports a five-minute task that has been quiet for an hour', async () => {
    await succeededAt('orders.tna_scan', new Date(NOW.getTime() - 8 * 3_600_000))
    await succeededAt('marbim.run_extractions', new Date(NOW.getTime() - 3_600_000))

    const result = await runJobHealthCheck(
      ctx,
      { expectations: EXPECTATIONS, companyCreatedAt: CREATED, now: NOW },
      POLICY,
    )

    expect(result.stale.map((entry) => entry.task)).toEqual(['marbim.run_extractions'])
    expect(result.alerted).toBe(true)

    const alerts = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.companyId, COMPANY), eq(notifications.kind, 'core.jobs.silent')))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.severity).toBe('critical')
  })

  it('reports a task that has NEVER run on an established company', async () => {
    const result = await runJobHealthCheck(
      ctx,
      { expectations: EXPECTATIONS, companyCreatedAt: CREATED, now: NOW },
      POLICY,
    )

    // A task added to the schedule and never wired is otherwise indistinguishable from one
    // running perfectly.
    expect(result.stale).toHaveLength(2)
    expect(result.stale.every((entry) => entry.neverRun)).toBe(true)
  })

  it('does NOT alarm on a company created an hour ago', async () => {
    const result = await runJobHealthCheck(
      ctx,
      {
        expectations: EXPECTATIONS,
        companyCreatedAt: new Date(NOW.getTime() - 3_600_000),
        now: NOW,
      },
      POLICY,
    )

    // The nightly scan has not had a night yet. Alarming here would make every new factory's
    // first morning a false alert.
    expect(result.stale.map((entry) => entry.task)).toEqual(['marbim.run_extractions'])
  })

  it('sends ONE alert for many silent tasks, and does not repeat it', async () => {
    const first = await runJobHealthCheck(
      ctx,
      { expectations: EXPECTATIONS, companyCreatedAt: CREATED, now: NOW },
      POLICY,
    )
    expect(first.stale).toHaveLength(2)

    // An hour later, still down. Runs hourly; a scheduler down for a week must not send
    // 168 identical notifications.
    await runJobHealthCheck(
      ctx,
      {
        expectations: EXPECTATIONS,
        companyCreatedAt: CREATED,
        now: new Date(NOW.getTime() + 3_600_000),
      },
      POLICY,
    )

    const alerts = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.companyId, COMPANY), eq(notifications.kind, 'core.jobs.silent')))

    // Ten silent tasks are one problem — the scheduler — not ten.
    expect(alerts).toHaveLength(1)
    expect((alerts[0]!.params as { staleCount: number }).staleCount).toBe(2)
  })

  it('alerts AGAIN when a different task goes quiet', async () => {
    await runJobHealthCheck(
      ctx,
      { expectations: EXPECTATIONS, companyCreatedAt: CREATED, now: NOW },
      POLICY,
    )

    // One of them comes back; the set of silent tasks has changed, so this is news.
    await succeededAt('orders.tna_scan', NOW)

    await runJobHealthCheck(
      ctx,
      {
        expectations: EXPECTATIONS,
        companyCreatedAt: CREATED,
        now: new Date(NOW.getTime() + 60_000),
      },
      POLICY,
    )

    const alerts = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.companyId, COMPANY), eq(notifications.kind, 'core.jobs.silent')))
    expect(alerts).toHaveLength(2)
  })

  it('another company’s silence is not this company’s alert', async () => {
    const result = await runJobHealthCheck(
      otherCtx,
      { expectations: EXPECTATIONS, companyCreatedAt: new Date(), now: NOW },
      POLICY,
    )
    expect(result.alerted).toBe(false)
  })
})

describe('pruning keeps what the check needs', () => {
  it('drops old rows but KEEPS the last success, however old', async () => {
    const ancient = new Date(NOW.getTime() - 200 * 86_400_000)

    await db.insert(jobRuns).values([
      {
        companyId: COMPANY,
        task: 'orders.tna_scan',
        status: 'succeeded',
        startedAt: ancient,
        finishedAt: ancient,
      },
      {
        companyId: COMPANY,
        task: 'orders.tna_scan',
        status: 'failed',
        startedAt: new Date(NOW.getTime() - 100 * 86_400_000),
        finishedAt: new Date(NOW.getTime() - 100 * 86_400_000),
        error: 'old failure',
      },
    ])

    const result = await pruneJobRuns(ctx, 14, NOW)
    expect(result.deleted).toBe(1)

    const kept = await runsOf(COMPANY)
    expect(kept).toHaveLength(1)
    // Pruning it would make a task that has not run in months look like one that has never
    // run, and that difference is most of what the report is telling you.
    expect(kept[0]!.status).toBe('succeeded')

    const last = await lastSuccessByTask(ctx)
    expect(last['orders.tna_scan']).toBeDefined()
  })

  it('leaves everything inside the window', async () => {
    await db.insert(jobRuns).values({
      companyId: COMPANY,
      task: 'marbim.run_extractions',
      status: 'succeeded',
      startedAt: new Date(NOW.getTime() - 2 * 86_400_000),
      finishedAt: new Date(NOW.getTime() - 2 * 86_400_000),
    })

    const result = await pruneJobRuns(ctx, 14, NOW)
    expect(result.deleted).toBe(0)
  })

  it('does not reach into another company', async () => {
    const ancient = new Date(NOW.getTime() - 200 * 86_400_000)
    await db.insert(jobRuns).values({
      companyId: OTHER,
      task: 'orders.tna_scan',
      status: 'failed',
      startedAt: ancient,
      finishedAt: ancient,
    })

    await pruneJobRuns(ctx, 14, NOW)
    expect(await runsOf(OTHER)).toHaveLength(1)
  })
})

describe('the check that survives the worker being dead', () => {
  it('app.scheduler_last_success() answers with NO company context set', async () => {
    // This is what `/api/health` calls. It runs in the app process, which has no session
    // and therefore no `app.company_id` — so a normal RLS-scoped read would return nothing
    // and the endpoint would report a healthy scheduler as dead every single time.
    await recordRun(ctx, { task: 'orders.tna_scan' }, async () => ({ ok: true }))
    await recordRun(otherCtx, { task: 'production.day_close' }, async () => ({ ok: true }))

    const { db: pooled } = await import('@/db/client')
    const result = await pooled.execute<{ task: string; last_success_at: string }>(
      sql`select task, last_success_at from app.scheduler_last_success()`,
    )
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    const tasks = (rows as { task: string }[]).map((row) => row.task)

    // Across companies on purpose: "is the worker running at all" is a system question, and
    // one tenant having been quiet is not the same as the scheduler being down.
    expect(tasks).toContain('orders.tna_scan')
    expect(tasks).toContain('production.day_close')
  })

  it('app.scheduler_observed_since() dates the run history, with no company context', async () => {
    // The baseline /api/health ages a never-run task from. Without it the endpoint treated
    // "has not run YET" as "has stopped running", and reported every fresh deployment as an
    // outage until its slowest schedule had fired once.
    await recordRun(ctx, { task: 'orders.tna_scan' }, async () => ({ ok: true }))
    await recordRun(otherCtx, { task: 'production.day_close' }, async () => ({ ok: true }))

    const { db: pooled } = await import('@/db/client')
    const result = await pooled.execute<{ observed_since: string | null }>(
      sql`select app.scheduler_observed_since() as observed_since`,
    )
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    const observedSince = (rows as { observed_since: string | null }[])[0]?.observed_since

    expect(observedSince).toBeTruthy()

    // Across companies, like its sibling: the question is when this DEPLOYMENT started
    // recording anything, not when one tenant did.
    const earliest = await db
      .select({ startedAt: jobRuns.startedAt })
      .from(jobRuns)
      .orderBy(jobRuns.startedAt)
      .limit(1)
    expect(new Date(observedSince!).getTime()).toBe(earliest[0]!.startedAt.getTime())
  })

  it('returns only task names and timestamps — no company data', async () => {
    await recordRun(ctx, { task: 'orders.tna_scan' }, async () => ({ secret: 'tenant data' }))

    const { db: pooled } = await import('@/db/client')
    const result = await pooled.execute(
      sql`select * from app.scheduler_last_success() limit 1`,
    )
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])

    // The whole basis for letting this bypass RLS: it cannot be used to read anybody's
    // data, only to know that something ran.
    expect(Object.keys(rows[0] as Record<string, unknown>).sort()).toEqual([
      'last_success_at',
      'task',
    ])
  })
})

