/**
 * Job health — pure vectors, written before the implementation.
 *
 * The failure this exists to catch is the quietest one in the system: a schedule that stops
 * firing looks exactly like a factory with nothing wrong. No error, no alert, no row — the
 * TNA scan simply never runs again and every milestone stays "on track" forever.
 *
 * Two things decide whether this works:
 *
 *  - the expected interval comes FROM the cron pattern, so it cannot drift away from the
 *    schedule it is supposed to be watching. A pattern shape the classifier does not know
 *    is refused rather than silently monitored at some default.
 *  - a task that has NEVER run is measured from the company's creation, not from nothing.
 *    Otherwise a task that was added and never wired reads the same as one that ran a
 *    minute ago, and a fresh factory alarms on its first morning.
 */
import { describe, expect, it } from 'vitest'

import {
  expectedIntervalMinutes,
  JobHealthError,
  maxSilenceMinutes,
  staleTasks,
  type TaskExpectation,
} from '../job-health'

const POLICY = { toleranceFactor: 1.5, floorMinutes: 15 }

describe('expectedIntervalMinutes · read the schedule, do not restate it', () => {
  it('1 · reads a sub-hourly step', () => {
    expect(expectedIntervalMinutes('*/5 * * * *')).toBe(5)
    expect(expectedIntervalMinutes('*/15 * * * *')).toBe(15)
  })

  it('2 · reads a daily pattern whatever time it fires at', () => {
    expect(expectedIntervalMinutes('30 1 * * *')).toBe(1_440)
    expect(expectedIntervalMinutes('0 8 * * *')).toBe(1_440)
    expect(expectedIntervalMinutes('45 2 * * *')).toBe(1_440)
  })

  it('3 · reads a monthly pattern as the LONGEST month', () => {
    // 30 days would alarm every January and July on the 31st, which is the fastest way to
    // teach somebody to ignore this alert.
    expect(expectedIntervalMinutes('0 4 1 * *')).toBe(44_640)
  })

  it('4 · reads an hourly pattern', () => {
    expect(expectedIntervalMinutes('0 * * * *')).toBe(60)
  })

  it('5 · REFUSES a shape it does not understand', () => {
    // Silently monitoring an unknown pattern at some default interval is worse than not
    // monitoring it: the dashboard would say it is being watched.
    expect(() => expectedIntervalMinutes('0 0 * * 1')).toThrow(JobHealthError)
    expect(() => expectedIntervalMinutes('*/5 9-17 * * *')).toThrow(JobHealthError)
    expect(() => expectedIntervalMinutes('not a cron')).toThrow(JobHealthError)
    expect(() => expectedIntervalMinutes('0 4 1 *')).toThrow(JobHealthError)
  })
})

describe('maxSilenceMinutes · how long is too long', () => {
  it('6 · is the interval plus a tolerance', () => {
    expect(maxSilenceMinutes(1_440, POLICY)).toBe(2_160)
  })

  it('7 · never drops below the floor', () => {
    // A five-minute task times out at 7.5 minutes without a floor, and a single slow run
    // would page somebody.
    expect(maxSilenceMinutes(5, POLICY)).toBe(15)
  })
})

describe('staleTasks · what has stopped firing', () => {
  const now = new Date('2026-03-10T09:00:00Z')
  /** Old enough that a task with no run at all is a real gap, not a fresh start. */
  const companyCreatedAt = new Date('2025-01-01T00:00:00Z')

  const expectation = (task: string, pattern: string): TaskExpectation => ({
    task,
    pattern,
  })

  it('8 · says nothing about a task that ran recently', () => {
    const stale = staleTasks({
      expectations: [expectation('marbim.run_extractions', '*/5 * * * *')],
      lastSuccessAt: { 'marbim.run_extractions': new Date('2026-03-10T08:57:00Z') },
      now,
      watchingSince: companyCreatedAt,
      policy: POLICY,
    })
    expect(stale).toEqual([])
  })

  it('9 · reports a five-minute task silent for twenty', () => {
    const stale = staleTasks({
      expectations: [expectation('marbim.run_extractions', '*/5 * * * *')],
      lastSuccessAt: { 'marbim.run_extractions': new Date('2026-03-10T08:40:00Z') },
      now,
      watchingSince: companyCreatedAt,
      policy: POLICY,
    })

    expect(stale).toHaveLength(1)
    expect(stale[0]!.task).toBe('marbim.run_extractions')
    expect(stale[0]!.silentMinutes).toBe(20)
    expect(stale[0]!.maxSilenceMinutes).toBe(15)
    expect(stale[0]!.neverRun).toBe(false)
  })

  it('10 · tolerates a nightly task that ran 25 hours ago', () => {
    // A job that fires at 01:30 and is checked at 09:00 the next day is 31.5 hours old and
    // perfectly healthy. Alarming on that would make this alert useless within a week.
    const stale = staleTasks({
      expectations: [expectation('orders.tna_scan', '30 1 * * *')],
      lastSuccessAt: { 'orders.tna_scan': new Date('2026-03-09T01:30:00Z') },
      now,
      watchingSince: companyCreatedAt,
      policy: POLICY,
    })
    expect(stale).toEqual([])
  })

  it('11 · reports a nightly task that has missed two nights', () => {
    const stale = staleTasks({
      expectations: [expectation('orders.tna_scan', '30 1 * * *')],
      lastSuccessAt: { 'orders.tna_scan': new Date('2026-03-07T01:30:00Z') },
      now,
      watchingSince: companyCreatedAt,
      policy: POLICY,
    })
    expect(stale).toHaveLength(1)
    expect(stale[0]!.silentMinutes).toBeGreaterThan(2_160)
  })

  it('12 · a task that NEVER ran is measured from the company’s creation', () => {
    // A task added to the schedule and never wired reads identically to one that ran a
    // minute ago, unless something anchors it.
    const stale = staleTasks({
      expectations: [expectation('orders.tna_scan', '30 1 * * *')],
      lastSuccessAt: {},
      now,
      watchingSince: companyCreatedAt,
      policy: POLICY,
    })

    expect(stale).toHaveLength(1)
    expect(stale[0]!.neverRun).toBe(true)
    expect(stale[0]!.lastSuccessAt).toBeNull()
  })

  it('13 · a BRAND NEW company does not alarm on its first morning', () => {
    const stale = staleTasks({
      expectations: [expectation('orders.tna_scan', '30 1 * * *')],
      lastSuccessAt: {},
      now,
      // Created two hours ago. The nightly scan has not had a night yet.
      watchingSince: new Date('2026-03-10T07:00:00Z'),
      policy: POLICY,
    })
    expect(stale).toEqual([])
  })

  it('14 · ranks the worst offender first', () => {
    const stale = staleTasks({
      expectations: [
        expectation('marbim.run_extractions', '*/5 * * * *'),
        expectation('orders.tna_scan', '30 1 * * *'),
      ],
      lastSuccessAt: {
        // 20 minutes silent against a 15-minute budget — 1.3× over.
        'marbim.run_extractions': new Date('2026-03-10T08:40:00Z'),
        // Three days silent against a 36-hour budget — 2× over.
        'orders.tna_scan': new Date('2026-03-07T01:30:00Z'),
      },
      now,
      watchingSince: companyCreatedAt,
      policy: POLICY,
    })

    // By how far each is PAST its own budget, not by raw minutes — otherwise every daily
    // task outranks every five-minute one purely for being daily.
    expect(stale.map((entry) => entry.task)).toEqual([
      'orders.tna_scan',
      'marbim.run_extractions',
    ])
  })

  it('16 · a worker that has only just started is not an outage', () => {
    // The shape that made /api/health return 503 on every fresh deployment: the frequent
    // tasks have fired, the nightly ones have not had a night yet, and measuring those from
    // the epoch reported a perfectly healthy worker as dead — for a day on every daily task
    // and a month on every monthly one.
    const startedAt = new Date('2026-03-10T08:57:00Z') // three minutes ago

    const stale = staleTasks({
      expectations: [
        expectation('marbim.run_extractions', '*/5 * * * *'),
        expectation('orders.tna_scan', '30 1 * * *'),
        expectation('maintenance.downtime_costs', '0 4 1 * *'),
      ],
      lastSuccessAt: { 'marbim.run_extractions': new Date('2026-03-10T08:58:00Z') },
      now,
      watchingSince: startedAt,
      policy: POLICY,
    })

    expect(stale).toEqual([])
  })

  it('17 · but the same never-run task IS reported once it has had its chance', () => {
    // The other half of 16: the grace period must expire, or the check would never fire.
    // Watching for ten days, and the nightly scan has still never run.
    const stale = staleTasks({
      expectations: [
        expectation('orders.tna_scan', '30 1 * * *'),
        // Monthly, and ten days is well inside its budget — still not a fault.
        expectation('maintenance.downtime_costs', '0 4 1 * *'),
      ],
      lastSuccessAt: {},
      now,
      watchingSince: new Date('2026-02-28T09:00:00Z'),
      policy: POLICY,
    })

    expect(stale.map((entry) => entry.task)).toEqual(['orders.tna_scan'])
    expect(stale[0]!.neverRun).toBe(true)
  })

  it('15 · REFUSES an expectation whose pattern it cannot classify', () => {
    expect(() =>
      staleTasks({
        expectations: [expectation('weird.task', '0 0 * * 1')],
        lastSuccessAt: {},
        now,
        watchingSince: companyCreatedAt,
        policy: POLICY,
      }),
    ).toThrow(JobHealthError)
  })
})
