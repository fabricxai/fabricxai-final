/**
 * Cutting vectors — written before the implementation.
 *
 * Cutting is where an order stops being reversible. Fabric cut to the wrong ratio cannot
 * be uncut, and a short cut is discovered in finishing, six weeks later, when there is no
 * fabric left to fix it with. Every number here is one somebody on a floor will be held
 * to.
 *
 * The two mistakes this file exists to prevent:
 *
 *  1. **Judging completion on a total.** 1,000 pieces cut against 1,000 ordered looks
 *     finished even when black is 200 short and white is 200 over. The buyer ordered a
 *     grid, not a total.
 *  2. **Netting over-cut against short-cut in the wastage figure.** Cutting extra burns
 *     fabric; cutting short burns the order. They are different failures and a single
 *     signed number hides both.
 */
import { describe, expect, it } from 'vitest'

import {
  bundlesForCell,
  cutCompletion,
  CuttingError,
  layYield,
  validateCutReport,
  wastageForOrder,
  type BreakdownCell,
  type CutCell,
  type MarkerSpec,
} from '../cutting'

const MARKER: MarkerSpec = {
  sizeRatio: { S: 1, M: 2, L: 1 },
  layLengthMeters: '6.40',
  fabricWidthInches: '58',
}

describe('layYield · what a lay actually produces', () => {
  it('1 · multiplies the size ratio by the ply count', () => {
    // A 100-ply lay of a 1:2:1 marker yields 100 S, 200 M, 100 L.
    const yielded = layYield(MARKER, 100)
    expect(yielded.perSize).toEqual({ S: 100, M: 200, L: 100 })
    expect(yielded.totalPieces).toBe(400)
  })

  it('2 · fabric planned is lay length × plies', () => {
    // 6.40 m × 100 plies = 640 m. This is the figure wastage is measured against.
    expect(layYield(MARKER, 100).plannedFabric).toBe('640.00')
  })

  it('3 · consumption per garment is the marker length over the pieces in it', () => {
    // 6.40 m across 4 garments = 1.60 m each. Exact — this number is what the cost sheet
    // was built on, and a rounding drift here is a margin argument later.
    expect(layYield(MARKER, 100).consumptionPerPiece).toBe('1.60')
  })

  it('4 · refuses a marker with no pieces in it', () => {
    expect(() => layYield({ ...MARKER, sizeRatio: {} }, 100)).toThrow(CuttingError)
    expect(() => layYield({ ...MARKER, sizeRatio: { S: 0 } }, 100)).toThrow(CuttingError)
  })

  it('5 · refuses a fractional or non-positive ply count', () => {
    // Half a ply does not exist on a cutting table.
    expect(() => layYield(MARKER, 0)).toThrow(CuttingError)
    expect(() => layYield(MARKER, 10.5)).toThrow(CuttingError)
  })

  it('6 · carries an exact consumption when it does not divide evenly', () => {
    // 6.40 / 3 = 2.1333… — held at the quantity scale, not silently widened.
    const odd = layYield({ ...MARKER, sizeRatio: { S: 1, M: 1, L: 1 } }, 50)
    expect(odd.consumptionPerPiece).toBe('2.13')
  })
})

describe('validateCutReport · against the ACTIVE breakdown revision', () => {
  const breakdown: BreakdownCell[] = [
    { color: 'Black', size: 'S', qty: 100 },
    { color: 'Black', size: 'M', qty: 200 },
    { color: 'White', size: 'S', qty: 100 },
  ]

  it('7 · accepts an exact cut', () => {
    const cut: CutCell[] = [
      { color: 'Black', size: 'S', qty: 100 },
      { color: 'Black', size: 'M', qty: 200 },
      { color: 'White', size: 'S', qty: 100 },
    ]
    const result = validateCutReport(breakdown, cut, { tolerancePct: '2' })

    expect(result.withinTolerance).toBe(true)
    expect(result.cells.every((c) => c.status === 'ok')).toBe(true)
  })

  it('8 · allows a small over-cut inside tolerance', () => {
    // Cutters cut a few extra so QC rejects can be replaced. Two percent of 200 is 4.
    const cut: CutCell[] = [
      { color: 'Black', size: 'S', qty: 100 },
      { color: 'Black', size: 'M', qty: 204 },
      { color: 'White', size: 'S', qty: 100 },
    ]
    expect(validateCutReport(breakdown, cut, { tolerancePct: '2' }).withinTolerance).toBe(true)
  })

  it('9 · flags the cell that is out, not the whole report', () => {
    const cut: CutCell[] = [
      { color: 'Black', size: 'S', qty: 100 },
      { color: 'Black', size: 'M', qty: 220 },
      { color: 'White', size: 'S', qty: 100 },
    ]
    const result = validateCutReport(breakdown, cut, { tolerancePct: '2' })

    expect(result.withinTolerance).toBe(false)
    const flagged = result.cells.filter((c) => c.status !== 'ok')
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toMatchObject({ color: 'Black', size: 'M', status: 'over', variance: 20 })
  })

  it('10 · reports over and short separately, never netted', () => {
    // 20 over on one cell and 20 short on another is not a balanced report — it is two
    // problems. A single signed total would read as zero.
    const cut: CutCell[] = [
      { color: 'Black', size: 'S', qty: 80 },
      { color: 'Black', size: 'M', qty: 220 },
      { color: 'White', size: 'S', qty: 100 },
    ]
    const result = validateCutReport(breakdown, cut, { tolerancePct: '2' })

    expect(result.totalOver).toBe(20)
    expect(result.totalShort).toBe(20)
    expect(result.withinTolerance).toBe(false)
  })

  it('11 · a cell cut but not ordered is an error, not an over-cut', () => {
    // Cutting a colour the buyer never ordered is a different mistake from cutting too
    // many of one they did, and the fabric is gone either way.
    const cut: CutCell[] = [...breakdown, { color: 'Red', size: 'S', qty: 50 }]
    const result = validateCutReport(breakdown, cut, { tolerancePct: '2' })

    const unknown = result.cells.find((c) => c.color === 'Red')
    expect(unknown?.status).toBe('not_ordered')
    expect(result.withinTolerance).toBe(false)
  })

  it('12 · an ordered cell with no cut yet is pending, not short', () => {
    // Mid-cut is the normal state of a cutting floor. Calling an uncut cell "short"
    // would make every report in progress look like a failure.
    const result = validateCutReport(breakdown, [{ color: 'Black', size: 'S', qty: 100 }], {
      tolerancePct: '2',
    })

    expect(result.cells.filter((c) => c.status === 'pending')).toHaveLength(2)
    expect(result.totalShort).toBe(0)
  })

  it('13 · rounds the tolerance in the cutter’s favour, and says so', () => {
    // 2% of 100 is 2 pieces. 2% of 101 is 2.02, which is 2 whole pieces — a fractional
    // garment cannot be cut, so the allowance floors rather than flattering the report.
    const single: BreakdownCell[] = [{ color: 'Black', size: 'S', qty: 101 }]
    const ok = validateCutReport(single, [{ color: 'Black', size: 'S', qty: 103 }], {
      tolerancePct: '2',
    })
    const notOk = validateCutReport(single, [{ color: 'Black', size: 'S', qty: 104 }], {
      tolerancePct: '2',
    })

    expect(ok.withinTolerance).toBe(true)
    expect(notOk.withinTolerance).toBe(false)
  })
})

describe('cutCompletion · a grid, not a total', () => {
  const breakdown: BreakdownCell[] = [
    { color: 'Black', size: 'S', qty: 500 },
    { color: 'White', size: 'S', qty: 500 },
  ]

  it('14 · is not complete when a total matches but the grid does not', () => {
    // 1,000 cut against 1,000 ordered — and 200 pieces of the wrong colour. The buyer
    // ordered a grid.
    const result = cutCompletion(breakdown, [
      { color: 'Black', size: 'S', qty: 300 },
      { color: 'White', size: 'S', qty: 700 },
    ])

    expect(result.complete).toBe(false)
    expect(result.shortCells).toEqual([{ color: 'Black', size: 'S', short: 200 }])
  })

  it('15 · is complete only when every cell is met', () => {
    const result = cutCompletion(breakdown, [
      { color: 'Black', size: 'S', qty: 500 },
      { color: 'White', size: 'S', qty: 500 },
    ])
    expect(result.complete).toBe(true)
    expect(result.pct).toBe('100.00')
  })

  it('16 · reports progress against the order, capped at 100', () => {
    // An over-cut does not make an order more than finished. 110% on a progress bar is a
    // number somebody will report to a buyer.
    const result = cutCompletion(breakdown, [
      { color: 'Black', size: 'S', qty: 600 },
      { color: 'White', size: 'S', qty: 500 },
    ])
    expect(result.pct).toBe('100.00')
    expect(result.complete).toBe(true)
  })

  it('17 · counts partial progress on the ordered quantity', () => {
    const result = cutCompletion(breakdown, [{ color: 'Black', size: 'S', qty: 250 }])
    expect(result.pct).toBe('25.00')
    expect(result.complete).toBe(false)
  })
})

describe('wastageForOrder', () => {
  it('18 · measures drawn fabric against the marker plan', () => {
    // 660 m drawn against a 640 m plan is 20 m over — 3.125%.
    const result = wastageForOrder({ fabricDrawn: '660.00', markerConsumption: '640.00' })
    expect(result.wastageQty).toBe('20.00')
    expect(result.wastagePct).toBe('3.13')
  })

  it('19 · reports drawing less than planned as negative, not as zero waste', () => {
    // Under-draw usually means the lay was short or a roll was mis-measured. Clamping it
    // to zero would hide the more interesting problem.
    const result = wastageForOrder({ fabricDrawn: '600.00', markerConsumption: '640.00' })
    expect(result.wastagePct).toBe('-6.25')
  })

  it('20 · refuses to divide by a zero plan', () => {
    expect(() => wastageForOrder({ fabricDrawn: '10.00', markerConsumption: '0' })).toThrow(
      CuttingError,
    )
  })
})

describe('bundlesForCell', () => {
  it('21 · splits a cell into full bundles plus the remainder', () => {
    const bundles = bundlesForCell({ color: 'Black', size: 'M', qty: 250 }, 100)

    expect(bundles).toHaveLength(3)
    expect(bundles.map((b) => b.qty)).toEqual([100, 100, 50])
    // Numbering is deterministic: a re-render must produce the same tickets, because the
    // old ones are already stapled to the bundles.
    expect(bundles.map((b) => b.bundleNo)).toEqual(['Black-M-01', 'Black-M-02', 'Black-M-03'])
  })

  it('22 · makes no remainder bundle when it divides evenly', () => {
    expect(bundlesForCell({ color: 'Black', size: 'M', qty: 200 }, 100)).toHaveLength(2)
  })

  it('23 · a cell smaller than one bundle is still one bundle', () => {
    const bundles = bundlesForCell({ color: 'White', size: 'S', qty: 7 }, 100)
    expect(bundles).toHaveLength(1)
    expect(bundles[0]!.qty).toBe(7)
  })

  it('24 · refuses a bundle size that is not a positive whole number', () => {
    expect(() => bundlesForCell({ color: 'A', size: 'S', qty: 10 }, 0)).toThrow(CuttingError)
    expect(() => bundlesForCell({ color: 'A', size: 'S', qty: 10 }, 2.5)).toThrow(CuttingError)
  })

  it('25 · every bundle carries the whole cell — the pieces are all accounted for', () => {
    const bundles = bundlesForCell({ color: 'Black', size: 'L', qty: 337 }, 60)
    expect(bundles.reduce((sum, b) => sum + b.qty, 0)).toBe(337)
  })
})
