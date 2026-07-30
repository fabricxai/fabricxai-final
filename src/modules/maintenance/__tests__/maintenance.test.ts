/**
 * 9.1 Machines & Tickets — pure vectors, written before the implementation.
 *
 * Three of these guard numbers that would otherwise be quietly invented:
 *
 *  - `estimatedDowntimeLoss` puts a taka figure on a stopped line. It refuses to produce
 *    one without a rate, because "0 BDT" against a four-hour stoppage is not a cautious
 *    answer, it is a wrong one that closes the question.
 *  - `breakdownOutliers` names machines the factory should look at. With a small fleet or a
 *    short window, ordinary variation looks like a pattern, so it demands a sample first.
 *  - `nextPmDue` on a monthly cadence has to survive month ends. A schedule that slides
 *    from the 31st to the 3rd drifts a machine's service forward every month of the year.
 */
import { describe, expect, it } from 'vitest'

import { money } from '@/lib/money'

import {
  breakdownOutliers,
  estimatedDowntimeLoss,
  MaintenanceError,
  nextPmDue,
  pmDueList,
  reorderList,
  utilizationPct,
} from '../maintenance'

describe('nextPmDue · a service schedule that does not drift', () => {
  it('1 · daily and weekly are plain day arithmetic', () => {
    expect(nextPmDue({ lastCompletedOn: '2026-03-10', cadence: 'daily' })).toBe('2026-03-11')
    expect(nextPmDue({ lastCompletedOn: '2026-03-10', cadence: 'weekly' })).toBe('2026-03-17')
  })

  it('2 · monthly from the 31st CLAMPS to the end of a short month', () => {
    // Naive month arithmetic gives 2026-03-03, and the machine's service walks forward a
    // few days every month until it is being serviced at the wrong time entirely.
    expect(nextPmDue({ lastCompletedOn: '2026-01-31', cadence: 'monthly' })).toBe('2026-02-28')
    expect(nextPmDue({ lastCompletedOn: '2026-03-31', cadence: 'monthly' })).toBe('2026-04-30')
  })

  it('3 · handles a leap February', () => {
    expect(nextPmDue({ lastCompletedOn: '2028-01-31', cadence: 'monthly' })).toBe('2028-02-29')
  })

  it('4 · crosses a year boundary', () => {
    expect(nextPmDue({ lastCompletedOn: '2026-12-15', cadence: 'monthly' })).toBe('2027-01-15')
  })

  it('5 · a machine that has NEVER been serviced is due now, not next month', () => {
    // Counting a cadence from nothing would give a brand-new or newly-registered machine a
    // month of grace it never earned.
    expect(nextPmDue({ lastCompletedOn: null, cadence: 'monthly', today: '2026-03-10' })).toBe(
      '2026-03-10',
    )
  })

  it('6 · REFUSES a cadence it does not know', () => {
    expect(() =>
      nextPmDue({ lastCompletedOn: '2026-03-10', cadence: 'quarterly' as never }),
    ).toThrow(MaintenanceError)
  })
})

describe('pmDueList · what the maintenance team does today', () => {
  const today = '2026-03-10'

  const schedules = [
    { scheduleId: 's1', machineId: 'm1', cadence: 'monthly' as const, lastCompletedOn: '2026-02-10' },
    { scheduleId: 's2', machineId: 'm2', cadence: 'weekly' as const, lastCompletedOn: '2026-02-20' },
    { scheduleId: 's3', machineId: 'm3', cadence: 'daily' as const, lastCompletedOn: '2026-03-10' },
    { scheduleId: 's4', machineId: 'm4', cadence: 'monthly' as const, lastCompletedOn: null },
  ]

  it('7 · ranks the most overdue first', () => {
    const due = pmDueList(schedules, today)
    // s2 was due 2026-02-27, eleven days ago — the worst.
    expect(due[0]!.machineId).toBe('m2')
    expect(due[0]!.daysOverdue).toBe(11)
  })

  it('8 · counts a never-serviced machine as due today, not as eleven years overdue', () => {
    const due = pmDueList(schedules, today)
    const never = due.find((d) => d.machineId === 'm4')!
    expect(never.dueOn).toBe(today)
    expect(never.daysOverdue).toBe(0)
    expect(never.neverServiced).toBe(true)
  })

  it('9 · leaves out what is not due yet', () => {
    // m3 was serviced today on a daily cadence — due tomorrow.
    expect(pmDueList(schedules, today).map((d) => d.machineId)).not.toContain('m3')
  })

  it('10 · a machine due exactly today IS on the list', () => {
    const due = pmDueList(
      [{ scheduleId: 's', machineId: 'm', cadence: 'daily' as const, lastCompletedOn: '2026-03-09' }],
      today,
    )
    expect(due).toHaveLength(1)
    expect(due[0]!.daysOverdue).toBe(0)
  })
})

describe('estimatedDowntimeLoss · a taka figure somebody will quote', () => {
  it('11 · minutes × the value of a minute, exactly', () => {
    const loss = estimatedDowntimeLoss({ minutes: 240, valuePerMinute: money('12.50', 'BDT') })
    expect(loss.amount).toBe('3000.00')
    expect(loss.currency).toBe('BDT')
  })

  it('12 · stays exact where a float would not', () => {
    // 100,000 × 0.07 is 7000 exactly. In floating point it is 7000.000000000001, and a
    // month of stoppages accumulates that into a figure somebody has to reconcile.
    const loss = estimatedDowntimeLoss({ minutes: 100_000, valuePerMinute: money('0.07', 'BDT') })
    expect(loss.amount).toBe('7000.00')
  })

  it('13 · REFUSES to price a stoppage with no rate', () => {
    // A zero here would print "0 BDT lost" beside a four-hour line stop, which reads as an
    // answer and closes the question. No figure at all is the honest output.
    expect(() =>
      estimatedDowntimeLoss({ minutes: 240, valuePerMinute: money('0', 'BDT') }),
    ).toThrow(MaintenanceError)
  })

  it('14 · REFUSES negative minutes', () => {
    expect(() =>
      estimatedDowntimeLoss({ minutes: -30, valuePerMinute: money('12.50', 'BDT') }),
    ).toThrow(MaintenanceError)
  })

  it('15 · a stoppage of zero minutes costs zero, which is a real answer', () => {
    const loss = estimatedDowntimeLoss({ minutes: 0, valuePerMinute: money('12.50', 'BDT') })
    expect(loss.amount).toBe('0.00')
  })
})

describe('utilizationPct · how much of the time a machine actually ran', () => {
  it('16 · is run over available', () => {
    expect(utilizationPct({ runMinutes: 384, availableMinutes: 480 })).toBe('80.00')
  })

  it('17 · REFUSES more run time than available', () => {
    // Not clamped to 100%. A machine that ran longer than its line was open means the
    // downtime or the calendar is wrong, and 100% would hide it.
    expect(() => utilizationPct({ runMinutes: 500, availableMinutes: 480 })).toThrow(
      MaintenanceError,
    )
  })

  it('18 · REFUSES a zero denominator rather than reporting 0%', () => {
    // A line that was never open has no utilization. Reporting 0% would put it at the top
    // of a worst-utilized list it does not belong on.
    expect(() => utilizationPct({ runMinutes: 0, availableMinutes: 0 })).toThrow(MaintenanceError)
  })
})

describe('breakdownOutliers · which machines to actually look at', () => {
  const POLICY = { minFleetTickets: 10, multiple: 3, minTickets: 5 }

  it('19 · names a machine breaking down far more than the typical one', () => {
    const fleet = [
      { machineId: 'm1', tickets: 2 },
      { machineId: 'm2', tickets: 3 },
      { machineId: 'm3', tickets: 2 },
      { machineId: 'm4', tickets: 3 },
      { machineId: 'm5', tickets: 18 },
    ]
    const outliers = breakdownOutliers(fleet, POLICY)
    expect(outliers.map((o) => o.machineId)).toEqual(['m5'])
    // Against the MEDIAN, not the mean — one bad machine drags a mean (and a standard
    // deviation) toward itself until it stops looking unusual.
    expect(outliers[0]!.fleetMedian).toBe(3)
    expect(outliers[0]!.timesMedian).toBe('6.0')
  })

  it('20 · says nothing when the window is too thin to mean anything', () => {
    // Three tickets across a fleet is not a pattern. Calling the machine with two of them
    // an outlier sends a mechanic to strip a machine that is fine.
    const outliers = breakdownOutliers(
      [
        { machineId: 'm1', tickets: 2 },
        { machineId: 'm2', tickets: 1 },
        { machineId: 'm3', tickets: 0 },
      ],
      POLICY,
    )
    expect(outliers).toEqual([])
  })

  it('21 · flags nobody when every machine breaks down equally', () => {
    const outliers = breakdownOutliers(
      Array.from({ length: 5 }, (_, i) => ({ machineId: `m${i}`, tickets: 4 })),
      POLICY,
    )
    expect(outliers).toEqual([])
  })

  it('22 · a fleet too small to have a typical machine flags nobody', () => {
    // Two machines have no "normal" between them: whichever broke down more is simply the
    // one that broke down more.
    expect(
      breakdownOutliers(
        [
          { machineId: 'm1', tickets: 40 },
          { machineId: 'm2', tickets: 1 },
        ],
        POLICY,
      ),
    ).toEqual([])
  })

  it('23 · still works when the typical machine has broken down zero times', () => {
    // Median 0. A ratio against it is undefined, so the absolute floor decides — and that
    // case (a good fleet with two bad machines) is exactly when this report earns its keep.
    const outliers = breakdownOutliers(
      [
        { machineId: 'm1', tickets: 0 },
        { machineId: 'm2', tickets: 0 },
        { machineId: 'm3', tickets: 0 },
        { machineId: 'm4', tickets: 6 },
        { machineId: 'm5', tickets: 11 },
      ],
      POLICY,
    )
    expect(outliers.map((o) => o.machineId)).toEqual(['m5', 'm4'])
    expect(outliers[0]!.timesMedian).toBeNull()
  })
})

describe('reorderList · spares that need ordering', () => {
  it('24 · lists parts at or below their minimum, shortest first', () => {
    const list = reorderList([
      { partId: 'p1', name: 'Looper', onHand: 2, minLevel: 5 },
      { partId: 'p2', name: 'Needle 90/14', onHand: 40, minLevel: 20 },
      { partId: 'p3', name: 'Feed dog', onHand: 0, minLevel: 4 },
      { partId: 'p4', name: 'Bobbin case', onHand: 6, minLevel: 6 },
    ])

    expect(list.map((p) => p.partId)).toEqual(['p3', 'p1', 'p4'])
    expect(list[0]!.shortfall).toBe(4)
    // At the minimum is already a reorder point, not a comfortable position.
    expect(list[2]!.shortfall).toBe(0)
  })

  it('25 · REFUSES negative stock', () => {
    // Stock below zero is a counting bug. Ordering against it would order the wrong amount.
    expect(() =>
      reorderList([{ partId: 'p1', name: 'Looper', onHand: -2, minLevel: 5 }]),
    ).toThrow(MaintenanceError)
  })

  it('26 · a fully stocked store needs nothing', () => {
    expect(reorderList([{ partId: 'p1', name: 'Looper', onHand: 10, minLevel: 5 }])).toEqual([])
  })
})
