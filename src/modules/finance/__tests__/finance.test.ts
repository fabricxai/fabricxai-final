/**
 * Finance vectors — written before the implementation.
 *
 * The brief names an explicit non-goal: "no GL here". This module answers two questions an
 * owner actually asks — "when does cash arrive and leave?" and "did we make money on that
 * order?" — and both have a well-known way of lying:
 *
 *  1. **The cash timeline must not count money twice.** A receivable that has already
 *     realized is cash in the bank, not cash arriving next week. Including it inflates
 *     every forecast, and the forecast is what an owner decides to buy fabric on.
 *  2. **A variance waterfall must ADD UP.** If the per-component variances do not sum to
 *     the total variance, the waterfall is decoration. That invariant is the whole point of
 *     the shape, and it is the first thing to break when a component is forgotten.
 *  3. **Margin basis has to travel with the number.** Costing quotes margin on price or on
 *     cost; comparing an actual computed one way against a quote computed the other way
 *     produces a variance made entirely of arithmetic.
 */
import { describe, expect, it } from 'vitest'

import {
  cashTimeline,
  expectedRealizationDate,
  FinanceError,
  orderProfitability,
  varianceWaterfall,
  type CostComponents,
} from '../finance'

describe('expectedRealizationDate · from the lag model', () => {
  it('1 · adds the buyer’s median lag to the submission date', () => {
    expect(
      expectedRealizationDate({ submittedAt: '2026-08-01', medianLagDays: 14 }),
    ).toBe('2026-08-15')
  })

  it('2 · falls back to the configured default when the buyer has no history', () => {
    // A new buyer has no lag to model. The default is stated, not zero.
    expect(
      expectedRealizationDate({ submittedAt: '2026-08-01', medianLagDays: null, fallbackDays: 30 }),
    ).toBe('2026-08-31')
  })

  it('3 · refuses to guess with neither a lag nor a default', () => {
    // Assuming zero would forecast cash arriving the day documents are lodged — the most
    // optimistic possible lie for a cash timeline to tell.
    expect(() =>
      expectedRealizationDate({ submittedAt: '2026-08-01', medianLagDays: null }),
    ).toThrow(FinanceError)
  })
})

describe('cashTimeline · eight weeks in and out', () => {
  const receivables = [
    { expectedAt: '2026-08-05', amount: '50000.00', realizedAt: null },
    { expectedAt: '2026-08-19', amount: '30000.00', realizedAt: null },
    // Already in the bank — must NOT appear as future cash.
    { expectedAt: '2026-08-12', amount: '80000.00', realizedAt: '2026-08-10' },
  ]
  const payables = [
    { dueAt: '2026-08-07', amount: '20000.00', paidAt: null },
    { dueAt: '2026-08-21', amount: '15000.00', paidAt: null },
    { dueAt: '2026-08-14', amount: '40000.00', paidAt: '2026-08-13' },
  ]

  it('4 · buckets by week from the start date', () => {
    const result = cashTimeline({
      from: '2026-08-03',
      weeks: 8,
      currency: 'USD',
      receivables,
      payables,
    })

    expect(result.buckets).toHaveLength(8)
    expect(result.buckets[0]).toMatchObject({
      weekStart: '2026-08-03',
      inflow: '50000.00',
      outflow: '20000.00',
      net: '30000.00',
    })
  })

  it('5 · excludes what has already settled', () => {
    const result = cashTimeline({
      from: '2026-08-03',
      weeks: 8,
      currency: 'USD',
      receivables,
      payables,
    })

    // Week of 10 August: the 80,000 realized and the 40,000 paid are both gone.
    expect(result.buckets[1]).toMatchObject({ inflow: '0.00', outflow: '0.00' })
    expect(result.totalInflow).toBe('80000.00')
    expect(result.totalOutflow).toBe('35000.00')
  })

  it('6 · carries a running balance from the opening position', () => {
    const result = cashTimeline({
      from: '2026-08-03',
      weeks: 8,
      currency: 'USD',
      openingBalance: '10000.00',
      receivables,
      payables,
    })

    expect(result.buckets[0]!.closingBalance).toBe('40000.00')
    expect(result.buckets[1]!.closingBalance).toBe('40000.00')
    // Week of 17 August: +30,000 in, −15,000 out.
    expect(result.buckets[2]!.closingBalance).toBe('55000.00')
  })

  it('7 · surfaces the week the balance first goes negative', () => {
    // The single most useful number on the screen: when does the factory run out of cash?
    const result = cashTimeline({
      from: '2026-08-03',
      weeks: 8,
      currency: 'USD',
      openingBalance: '5000.00',
      receivables: [],
      payables: [{ dueAt: '2026-08-19', amount: '15000.00', paidAt: null }],
    })

    expect(result.firstNegativeWeek).toBe('2026-08-17')
  })

  it('8 · says nothing goes negative when nothing does', () => {
    const result = cashTimeline({
      from: '2026-08-03',
      weeks: 8,
      currency: 'USD',
      openingBalance: '100000.00',
      receivables,
      payables,
    })
    expect(result.firstNegativeWeek).toBeNull()
  })

  it('9 · ignores items outside the window rather than folding them into week one', () => {
    // A payable due in six months is not this quarter's problem, and putting it in the
    // first bucket would make every timeline look like a crisis.
    const result = cashTimeline({
      from: '2026-08-03',
      weeks: 8,
      currency: 'USD',
      receivables: [{ expectedAt: '2027-03-01', amount: '99999.00', realizedAt: null }],
      payables: [{ dueAt: '2026-01-01', amount: '88888.00', paidAt: null }],
    })

    expect(result.totalInflow).toBe('0.00')
    expect(result.totalOutflow).toBe('0.00')
    expect(result.excludedOutsideWindow).toBe(2)
  })

  it('10 · refuses to mix currencies', () => {
    // Adding taka to dollars needs a rate nobody stated. Same rule as everywhere else.
    expect(() =>
      cashTimeline({
        from: '2026-08-03',
        weeks: 8,
        currency: 'USD',
        receivables: [{ expectedAt: '2026-08-05', amount: '1.00', realizedAt: null, currency: 'BDT' }],
        payables: [],
      }),
    ).toThrow(/a rate is required/i)
  })
})

describe('varianceWaterfall · it has to add up', () => {
  const quoted: CostComponents = {
    materials: '3.20',
    cm: '0.95',
    commercial: '0.23',
  }
  const actual: CostComponents = {
    materials: '3.45',
    cm: '0.90',
    commercial: '0.31',
  }

  it('11 · the component variances sum to the total variance', () => {
    // The invariant the whole shape exists for. A waterfall whose steps do not reach the
    // total is decoration.
    const result = varianceWaterfall(quoted, actual)

    expect(result.steps).toEqual([
      { component: 'materials', quoted: '3.20', actual: '3.45', variance: '0.25' },
      { component: 'cm', quoted: '0.95', actual: '0.90', variance: '-0.05' },
      { component: 'commercial', quoted: '0.23', actual: '0.31', variance: '0.08' },
    ])
    expect(result.totalVariance).toBe('0.28')

    // Summed in cents from the strings, so the invariant is checked without a float ever
    // touching a money value.
    const cents = (value: string): bigint => {
      const negative = value.startsWith('-')
      const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
      const minor = BigInt(whole + fraction.padEnd(2, '0'))
      return negative ? -minor : minor
    }
    const summed = result.steps.reduce((carried, step) => carried + cents(step.variance), 0n)
    expect(summed).toBe(cents(result.totalVariance))
  })

  it('12 · a component quoted but never actualised shows as its full quoted value', () => {
    // Not as zero variance. A component nobody costed is a component that came in at zero,
    // and hiding that makes the total unreachable from the steps.
    const result = varianceWaterfall(quoted, { materials: '3.45' })

    const cm = result.steps.find((s) => s.component === 'cm')!
    expect(cm).toEqual({ component: 'cm', quoted: '0.95', actual: '0.00', variance: '-0.95' })
  })

  it('13 · an actual with no quote shows as a pure overrun', () => {
    const result = varianceWaterfall({ materials: '3.20' }, { materials: '3.20', freight: '0.12' })
    const freight = result.steps.find((s) => s.component === 'freight')!
    expect(freight).toEqual({
      component: 'freight',
      quoted: '0.00',
      actual: '0.12',
      variance: '0.12',
    })
  })

  it('14 · orders the steps the same way every time', () => {
    const a = varianceWaterfall(quoted, actual)
    const b = varianceWaterfall(
      { commercial: '0.23', cm: '0.95', materials: '3.20' },
      { commercial: '0.31', cm: '0.90', materials: '3.45' },
    )
    expect(a.steps.map((s) => s.component)).toEqual(b.steps.map((s) => s.component))
  })
})

describe('orderProfitability', () => {
  it('15 · computes the actual margin on the same basis as the quote', () => {
    // FOB 5.00, actual cost 4.66 → 0.34 profit. On PRICE that is 6.80%.
    const result = orderProfitability({
      fobPrice: '5.00',
      quotedMarginPct: '12.00',
      marginBasis: 'price',
      actual: { materials: '3.45', cm: '0.90', commercial: '0.31' },
    })

    expect(result.actualCost).toBe('4.66')
    expect(result.actualMarginPct).toBe('6.80')
    expect(result.marginBasis).toBe('price')
    expect(result.marginVariancePct).toBe('-5.20')
  })

  it('16 · the same figures on a COST basis give a different margin', () => {
    // 0.34 on a 4.66 cost is 7.30%, not 6.80%. Comparing one basis against the other
    // produces a variance made entirely of arithmetic.
    const result = orderProfitability({
      fobPrice: '5.00',
      quotedMarginPct: '12.00',
      marginBasis: 'cost',
      actual: { materials: '3.45', cm: '0.90', commercial: '0.31' },
    })

    expect(result.actualMarginPct).toBe('7.30')
  })

  it('17 · reports a loss as a negative margin, not as zero', () => {
    const result = orderProfitability({
      fobPrice: '4.00',
      quotedMarginPct: '12.00',
      marginBasis: 'price',
      actual: { materials: '3.45', cm: '0.90', commercial: '0.31' },
    })

    expect(result.actualCost).toBe('4.66')
    expect(result.actualMarginPct).toBe('-16.50')
    expect(result.lossMaking).toBe(true)
  })

  it('18 · refuses a zero FOB price', () => {
    expect(() =>
      orderProfitability({
        fobPrice: '0.00',
        quotedMarginPct: '12.00',
        marginBasis: 'price',
        actual: { materials: '1.00' },
      }),
    ).toThrow(FinanceError)
  })

  it('19 · refuses an order with no actual costs recorded', () => {
    // Zero cost would report a 100% margin, which is the most flattering possible lie.
    expect(() =>
      orderProfitability({
        fobPrice: '5.00',
        quotedMarginPct: '12.00',
        marginBasis: 'price',
        actual: {},
      }),
    ).toThrow(FinanceError)
  })
})
