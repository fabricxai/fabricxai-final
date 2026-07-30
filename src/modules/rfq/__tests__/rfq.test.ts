/**
 * RFQ & quotation vectors — written before the implementation.
 *
 * This is the module that decides what the factory charges, so the failures are all about
 * quoting a number nobody can stand behind:
 *
 *  1. **A quote is a SNAPSHOT of a cost sheet, not a pointer to one.** The sheet gets
 *     repriced; the quote the buyer holds does not change. A breakdown that recomputes from
 *     today's sheet is a quote nobody can reproduce when the buyer asks why the price moved.
 *  2. **The breakdown must reconcile to the price.** If the components do not sum to the
 *     FOB, the breakdown is decoration — and it is the thing a buyer negotiates against
 *     line by line.
 *  3. **Won means an order, so the payload has to be complete.** A `rfq.won` missing the
 *     size ratio produces an order nobody can cut.
 */
import { describe, expect, it } from 'vitest'

import {
  buildFobBreakdown,
  isQuoteExpired,
  RfqError,
  rfqStatusMachine,
  wonPayload,
  type CostSheetSnapshot,
} from '../rfq'

const SHEET: CostSheetSnapshot = {
  costSheetId: 'cs-1',
  version: 3,
  currency: 'USD',
  fobPrice: '4.98',
  totalCost: '4.38',
  marginPct: '12',
  marginBasis: 'price',
  components: {
    fabric: '3.20',
    trims: '0.42',
    embellishment: '0.10',
    cm: '0.43',
    commercial: '0.23',
  },
  cmLocalPerPiece: '51.81',
  localCurrency: 'BDT',
}

describe('buildFobBreakdown · a snapshot that reconciles', () => {
  it('1 · carries every component and the price they add up to', () => {
    const result = buildFobBreakdown(SHEET)

    expect(result.components).toEqual(SHEET.components)
    expect(result.totalCost).toBe('4.38')
    expect(result.fobPrice).toBe('4.98')
  })

  it('2 · the components sum to the total cost', () => {
    // The invariant a buyer negotiates against line by line. If they do not reconcile the
    // breakdown is decoration.
    const result = buildFobBreakdown(SHEET)
    expect(result.componentsTotal).toBe('4.38')
    expect(result.reconciles).toBe(true)
  })

  it('3 · reports a breakdown that does NOT reconcile rather than hiding it', () => {
    // A sheet whose stored total disagrees with its own components has been tampered with
    // or was written by older code. Quoting from it would put a number in front of a buyer
    // that the factory cannot rebuild.
    const result = buildFobBreakdown({ ...SHEET, totalCost: '4.90' })

    expect(result.reconciles).toBe(false)
    expect(result.componentsTotal).toBe('4.38')
  })

  it('4 · carries the margin and its BASIS', () => {
    // 12% on price and 12% on cost are different prices. A quote that does not say which
    // cannot be checked.
    const result = buildFobBreakdown(SHEET)
    expect(result.marginPct).toBe('12')
    expect(result.marginBasis).toBe('price')
  })

  it('5 · carries the CM in local currency alongside the converted one', () => {
    // The factory argues about CM in taka; the buyer sees it in dollars. Both belong on
    // the quote, or the two sides are discussing different numbers.
    const result = buildFobBreakdown(SHEET)
    expect(result.cmLocalPerPiece).toBe('51.81')
    expect(result.localCurrency).toBe('BDT')
  })

  it('6 · refuses a sheet with no components', () => {
    expect(() => buildFobBreakdown({ ...SHEET, components: {} })).toThrow(RfqError)
  })

  it('7 · refuses a zero FOB price', () => {
    expect(() => buildFobBreakdown({ ...SHEET, fobPrice: '0.00' })).toThrow(RfqError)
  })

  it('8 · computes the achieved margin from the snapshot, not from the sheet’s claim', () => {
    // (4.98 − 4.38) / 4.98 = 12.05%. The sheet says 12; the small difference is rounding
    // in the sheet's own price, and the quote reports what the numbers actually give.
    const result = buildFobBreakdown(SHEET)
    expect(result.achievedMarginPct).toBe('12.05')
  })
})

describe('isQuoteExpired', () => {
  it('9 · a quote past its validity date is expired', () => {
    expect(isQuoteExpired({ validityDate: '2026-07-29', today: '2026-07-30' })).toBe(true)
  })

  it('10 · the validity date itself is still valid', () => {
    // A quote valid "until 30 July" is valid on 30 July. Expiring a day early loses orders.
    expect(isQuoteExpired({ validityDate: '2026-07-30', today: '2026-07-30' })).toBe(false)
  })

  it('11 · a quote with no validity date never expires on its own', () => {
    // Absent a stated date, expiry is a commercial decision rather than an arithmetic one.
    expect(isQuoteExpired({ validityDate: null, today: '2026-07-30' })).toBe(false)
  })
})

describe('wonPayload · what becomes an order', () => {
  const base = {
    rfqId: 'r-1',
    buyerId: 'b-1',
    styleCode: 'ST-100',
    quantity: 12000,
    unit: 'pcs',
    sizeRatio: { S: 1, M: 2, L: 2, XL: 1 },
    fobPrice: '4.98',
    currency: 'USD',
    requestedShipDate: '2026-11-15',
  }

  it('12 · assembles everything an order needs', () => {
    const payload = wonPayload(base)

    expect(payload.buyerId).toBe('b-1')
    expect(payload.quantity).toBe(12000)
    expect(payload.sizeRatio).toEqual(base.sizeRatio)
    expect(payload.fobPrice).toBe('4.98')
  })

  it('13 · refuses a win with no size ratio', () => {
    // An order without a ratio cannot be cut — 5.1 needs pieces per size, and "12,000
    // pieces" is not a cutting instruction.
    expect(() => wonPayload({ ...base, sizeRatio: {} })).toThrow(RfqError)
  })

  it('14 · refuses a size ratio that is all zeroes', () => {
    expect(() => wonPayload({ ...base, sizeRatio: { S: 0, M: 0 } })).toThrow(RfqError)
  })

  it('15 · refuses a win with no requested ship date', () => {
    // The TNA is generated backwards from the ship date. Without one there is no plan.
    expect(() => wonPayload({ ...base, requestedShipDate: null })).toThrow(/ship date/i)
  })

  it('16 · refuses a non-positive quantity', () => {
    expect(() => wonPayload({ ...base, quantity: 0 })).toThrow(RfqError)
  })

  it('17 · breaks the quantity down by the ratio, so the numbers reach the floor', () => {
    // 12,000 over a 1:2:2:1 ratio = 2,000 / 4,000 / 4,000 / 2,000.
    const payload = wonPayload(base)
    expect(payload.sizeBreakdown).toEqual({ S: 2000, M: 4000, L: 4000, XL: 2000 })
  })

  it('18 · puts the remainder on the largest size rather than losing it', () => {
    // 10,001 over 1:2:2:1 does not divide. The breakdown must still add up to the order —
    // a piece dropped here is a piece short at final inspection.
    const payload = wonPayload({ ...base, quantity: 10001 })
    const total = Object.values(payload.sizeBreakdown).reduce((a, b) => a + b, 0)

    expect(total).toBe(10001)
    expect(payload.sizeBreakdown.M!).toBeGreaterThan(payload.sizeBreakdown.S!)
  })
})

describe('rfqStatusMachine', () => {
  it('19 · walks open → quoted → won', () => {
    expect(() => rfqStatusMachine.assert('open', 'quoted')).not.toThrow()
    expect(() => rfqStatusMachine.assert('quoted', 'won')).not.toThrow()
  })

  it('20 · can go back to clarifying after quoting, because buyers ask questions', () => {
    expect(() => rfqStatusMachine.assert('quoted', 'clarifying')).not.toThrow()
  })

  it('20b · re-quoting an already-quoted RFQ is legal', () => {
    // The buyer pushed back on price. Forbidding this would force a merchandiser to move
    // the RFQ backwards just to re-price it.
    expect(() => rfqStatusMachine.assert('quoted', 'quoted')).not.toThrow()
  })

  it('21 · cannot win an RFQ that was never quoted', () => {
    // Winning without a quote means there is no price, and the order it creates has none.
    expect(() => rfqStatusMachine.assert('open', 'won')).toThrow()
  })

  it('22 · won is terminal — it is an order now', () => {
    expect(() => rfqStatusMachine.assert('won', 'quoted')).toThrow()
  })
})
