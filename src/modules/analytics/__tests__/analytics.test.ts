/**
 * 11.2 Owner Dashboard & Analytics — pure vectors, written before the implementation.
 *
 * An owner's dashboard is where a wrong number does the most damage, because it is the one
 * screen nobody re-derives. Four things below are the ones that would mislead:
 *
 *  - Efficiency and DHU are RATIOS. The mean of daily percentages is not the period's
 *    efficiency, and on a factory where output swings day to day the two differ by several
 *    points — always in the flattering direction on the days that went badly.
 *  - A percentage needs a denominator worth having. Six orders is not an on-time-delivery
 *    record, and a buyer scorecard built on two orders ranks a stranger above a decade-long
 *    customer.
 *  - Two points are not a trend.
 *  - Every cached figure carries the time it was computed. A five-minute-old cash position
 *    presented as "now" is how somebody pays a supplier twice.
 */
import { describe, expect, it } from 'vitest'

import { money } from '@/lib/money'

import {
  AnalyticsError,
  asOf,
  buyerScorecard,
  cashPosition,
  dhuForPeriod,
  efficiencyForPeriod,
  exceptionSeverity,
  otdPct,
  trendDirection,
} from '../analytics'

describe('efficiencyForPeriod · a ratio, not an average of ratios', () => {
  const days = [
    // A good day with barely any output, and a bad day carrying the whole month.
    { earnedMinutes: '900.00', availableMinutes: '1000.00' },
    { earnedMinutes: '9000.00', availableMinutes: '20000.00' },
  ]

  it('1 · sums the minutes and divides once', () => {
    // 9,900 earned over 21,000 available = 47.14%.
    expect(efficiencyForPeriod(days)).toBe('47.14')
  })

  it('2 · is NOT the mean of the daily percentages', () => {
    // The mean of 90% and 45% is 67.5% — twenty points of flattery, produced entirely by a
    // day on which the factory made almost nothing.
    expect(efficiencyForPeriod(days)).not.toBe('67.50')
  })

  it('3 · REFUSES a period with no available minutes', () => {
    // A factory that was shut has no efficiency. Reporting 0% puts it at the bottom of a
    // league table it is not in.
    expect(() => efficiencyForPeriod([{ earnedMinutes: '0', availableMinutes: '0' }])).toThrow(
      AnalyticsError,
    )
    expect(() => efficiencyForPeriod([])).toThrow(AnalyticsError)
  })
})

describe('dhuForPeriod · defects per hundred units', () => {
  it('4 · sums both sides before dividing', () => {
    // 30 defects across 1,500 garments checked = 2.00 DHU.
    expect(
      dhuForPeriod([
        { defects: 10, checked: 200 },
        { defects: 20, checked: 1_300 },
      ]),
    ).toBe('2.00')
  })

  it('5 · is not the mean of the daily figures', () => {
    // The daily DHUs are 5.00 and 1.54; their mean is 3.27, which no day and no period was.
    expect(
      dhuForPeriod([
        { defects: 10, checked: 200 },
        { defects: 20, checked: 1_300 },
      ]),
    ).not.toBe('3.27')
  })

  it('6 · REFUSES a period in which nothing was checked', () => {
    expect(() => dhuForPeriod([{ defects: 0, checked: 0 }])).toThrow(AnalyticsError)
  })
})

describe('otdPct · on-time delivery', () => {
  it('7 · counts a shipment that left ON its date as on time', () => {
    // The commitment is the date, not the day before it.
    expect(otdPct({ shipped: 10, onTime: 10, minShipments: 5 })).toBe('100.00')
  })

  it('8 · is a plain ratio otherwise', () => {
    expect(otdPct({ shipped: 8, onTime: 6, minShipments: 5 })).toBe('75.00')
  })

  it('9 · REFUSES to report a percentage on too few shipments', () => {
    // Two shipments, one late, is not "50% on-time delivery" — it is two shipments. Putting
    // that figure on a buyer scorecard ranks a new buyer against a decade-long one.
    expect(() => otdPct({ shipped: 2, onTime: 1, minShipments: 5 })).toThrow(AnalyticsError)
  })

  it('10 · REFUSES a period with no shipments at all', () => {
    expect(() => otdPct({ shipped: 0, onTime: 0, minShipments: 5 })).toThrow(AnalyticsError)
  })

  it('11 · REFUSES more on-time shipments than shipments', () => {
    // The join is wrong. Clamping to 100% would hide it behind a perfect score.
    expect(() => otdPct({ shipped: 5, onTime: 7, minShipments: 5 })).toThrow(AnalyticsError)
  })
})

describe('trendDirection · two points are not a trend', () => {
  it('12 · says nothing from fewer than four points', () => {
    expect(trendDirection([60, 64, 68], { minPoints: 4, thresholdPct: '2' })).toBe('unknown')
  })

  it('13 · calls a sustained rise improving', () => {
    expect(trendDirection([55, 58, 61, 64, 67], { minPoints: 4, thresholdPct: '2' })).toBe(
      'improving',
    )
  })

  it('14 · calls a sustained fall worsening', () => {
    expect(trendDirection([67, 64, 61, 58, 55], { minPoints: 4, thresholdPct: '2' })).toBe(
      'worsening',
    )
  })

  it('15 · calls ordinary noise flat', () => {
    // Half a point either way over a fortnight is a factory, not a trend.
    expect(trendDirection([60, 61, 60, 59, 60, 61], { minPoints: 4, thresholdPct: '2' })).toBe(
      'flat',
    )
  })
})

describe('buyerScorecard · ranking somebody’s customers', () => {
  const POLICY = { minOrders: 5, weights: { otd: 0.5, dhu: 0.3, margin: 0.2 } }

  it('16 · scores a buyer with enough history', () => {
    const card = buyerScorecard(
      { buyerId: 'b1', orders: 12, otdPct: '90.00', dhu: '2.00', avgMarginPct: '18.00' },
      POLICY,
    )
    expect(card.rated).toBe(true)
    expect(Number(card.score)).toBeGreaterThan(0)
  })

  it('17 · REFUSES to score a buyer with too little history, and says why', () => {
    // Not a low score — no score. A buyer with two orders scoring 40 sits below one with
    // eighty orders scoring 60, as though the comparison meant something.
    const card = buyerScorecard(
      { buyerId: 'b2', orders: 2, otdPct: '50.00', dhu: '9.00', avgMarginPct: '4.00' },
      POLICY,
    )
    expect(card.rated).toBe(false)
    expect(card.score).toBeNull()
    expect(card.reason).toMatch(/orders/)
  })

  it('18 · REFUSES weights that do not add up', () => {
    // Weights summing to 0.9 silently scale every score down by a tenth, and the ranking
    // looks fine — which is why nobody would find it.
    expect(() =>
      buyerScorecard(
        { buyerId: 'b1', orders: 12, otdPct: '90.00', dhu: '2.00', avgMarginPct: '18.00' },
        { minOrders: 5, weights: { otd: 0.5, dhu: 0.3, margin: 0.1 } },
      ),
    ).toThrow(AnalyticsError)
  })

  it('19 · a missing component is not treated as zero', () => {
    // A buyer with no margin data is not a buyer with no margin. Scoring them at zero on
    // that component would put a profitable customer at the bottom of the list.
    const card = buyerScorecard(
      { buyerId: 'b3', orders: 12, otdPct: '90.00', dhu: '2.00', avgMarginPct: null },
      POLICY,
    )
    expect(card.rated).toBe(false)
    expect(card.reason).toMatch(/margin/)
  })
})

describe('cashPosition · money, exactly', () => {
  it('20 · nets receivables against payables in one currency', () => {
    const position = cashPosition({
      receivables: [money('50000.00', 'USD'), money('25000.50', 'USD')],
      payables: [money('30000.25', 'USD')],
      currency: 'USD',
    })
    expect(position.net.amount).toBe('45000.25')
    expect(position.inflow.amount).toBe('75000.50')
    expect(position.outflow.amount).toBe('30000.25')
  })

  it('21 · REFUSES to net across currencies', () => {
    // USD receivables and BDT payables net to a number in neither. There is no ambient
    // exchange rate in this system, and inventing one here would be the worst place to.
    expect(() =>
      cashPosition({
        receivables: [money('50000.00', 'USD')],
        payables: [money('30000.00', 'BDT')],
        currency: 'USD',
      }),
    ).toThrow()
  })

  it('22 · an empty position is zero, not an error', () => {
    const position = cashPosition({ receivables: [], payables: [], currency: 'USD' })
    expect(position.net.amount).toBe('0.00')
  })
})

describe('exceptionSeverity · how loud an exception gets', () => {
  it('23 · a critical CAP is high from the moment it appears', () => {
    expect(exceptionSeverity({ kind: 'cap_critical', ageDays: 0 })).toBe('high')
  })

  it('24 · an LC conflict escalates with age', () => {
    expect(exceptionSeverity({ kind: 'lc_conflict', ageDays: 0 })).toBe('medium')
    expect(exceptionSeverity({ kind: 'lc_conflict', ageDays: 8 })).toBe('high')
  })

  it('25 · something waiting for approval starts low and still escalates', () => {
    expect(exceptionSeverity({ kind: 'approval_waiting', ageDays: 1 })).toBe('low')
    expect(exceptionSeverity({ kind: 'approval_waiting', ageDays: 30 })).toBe('high')
  })

  it('26 · REFUSES a kind it does not know', () => {
    // A new exception kind silently defaulting to `low` is a new class of problem nobody
    // is shown.
    expect(() => exceptionSeverity({ kind: 'something_new' as never, ageDays: 3 })).toThrow(
      AnalyticsError,
    )
  })
})

describe('asOf · every cached figure says how old it is', () => {
  const computedAt = new Date('2026-03-10T09:00:00Z')

  it('27 · reports the age and that it is fresh', () => {
    const stamp = asOf(computedAt, new Date('2026-03-10T09:02:00Z'), 300)
    expect(stamp.ageSeconds).toBe(120)
    expect(stamp.stale).toBe(false)
  })

  it('28 · marks it stale past the TTL', () => {
    // Presented as "now", a five-minute-old cash position is how a supplier gets paid twice.
    const stamp = asOf(computedAt, new Date('2026-03-10T09:06:00Z'), 300)
    expect(stamp.stale).toBe(true)
  })

  it('29 · REFUSES a computation timestamped in the future', () => {
    // Clock skew between the worker and the web tier. A negative age would render as
    // "computed in 4 seconds" and, worse, would never be stale.
    expect(() => asOf(computedAt, new Date('2026-03-10T08:59:56Z'), 300)).toThrow(AnalyticsError)
  })
})
