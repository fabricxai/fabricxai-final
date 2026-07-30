/**
 * Shipment vectors — written before the implementation.
 *
 * This is the last module before goods leave the country, so everything here is expensive
 * to get wrong in a way nothing downstream can fix:
 *
 *  1. **Over-pack.** Packing more than finishing produced means a carton contains garments
 *     that do not exist. The brief says over-pack is "rejected with cell detail" — a total
 *     is useless to somebody standing at a carton, they need to know which colour and size.
 *  2. **The mismatch report** compares packed against the buyer's ORDERED grid. A shipment
 *     whose totals match but whose grid does not is a claim waiting to happen.
 *  3. **LC tolerance is a band, not a ceiling.** A 5% tolerance permits 95–105%. Shipping
 *     90% is a discrepancy the bank can refuse the documents on, exactly like shipping
 *     110% — and a check that only looks upward misses half of them.
 *  4. **Chargeable weight is the greater of actual and volumetric.** A carton of t-shirts
 *     is charged on its volume, not its weight, and quoting freight on gross kilos
 *     understates the bill on every light carton.
 */
import { describe, expect, it } from 'vitest'

import {
  cartonCbm,
  chargeableWeightKg,
  latestShipmentCountdown,
  lcToleranceCheck,
  packingMismatches,
  remainingToPack,
  ShipmentError,
  type CellMap,
} from '../shipment'

const finished: CellMap = { 'Black|S': 100, 'Black|M': 200, 'White|S': 100 }

describe('remainingToPack · finishing minus packed', () => {
  it('1 · is the whole finished quantity when nothing is packed', () => {
    expect(remainingToPack(finished, {})).toEqual(finished)
  })

  it('2 · subtracts what is already in cartons', () => {
    const result = remainingToPack(finished, { 'Black|S': 60, 'Black|M': 200 })
    // Black/M is fully packed, so it drops out rather than sitting at zero.
    expect(result).toEqual({ 'Black|S': 40, 'White|S': 100 })
  })

  it('3 · reports an over-pack per CELL, not as a total', () => {
    // Somebody standing at a carton needs to know it is Black/S that is over, not that
    // the order is "10 over" somewhere.
    const result = remainingToPack(finished, { 'Black|S': 110 }, { allowOverPack: true })
    expect(result['Black|S']).toBe(-10)
  })

  it('4 · refuses an over-pack by default, naming the cells', () => {
    let thrown: unknown
    try {
      remainingToPack(finished, { 'Black|S': 110, 'White|S': 105 })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ShipmentError)
    expect((thrown as ShipmentError).cells).toEqual([
      { cell: 'Black|S', finished: 100, packed: 110, over: 10 },
      { cell: 'White|S', finished: 100, packed: 105, over: 5 },
    ])
  })

  it('5 · packing a cell finishing never produced is an over-pack, not a new cell', () => {
    // A carton holding a colour nobody finished is garments that do not exist.
    expect(() => remainingToPack(finished, { 'Red|S': 5 })).toThrow(ShipmentError)
  })

  it('6 · refuses a negative or fractional packed quantity', () => {
    expect(() => remainingToPack(finished, { 'Black|S': -5 })).toThrow(ShipmentError)
    expect(() => remainingToPack(finished, { 'Black|S': 1.5 })).toThrow(ShipmentError)
  })
})

describe('packingMismatches · packed against the ORDERED grid', () => {
  const ordered: CellMap = { 'Black|S': 100, 'Black|M': 200, 'White|S': 100 }

  it('7 · finds nothing when the grid matches', () => {
    const result = packingMismatches(ordered, ordered)
    expect(result.mismatches).toEqual([])
    expect(result.matches).toBe(true)
  })

  it('8 · catches a grid that is wrong even though the total is right', () => {
    // 400 packed against 400 ordered, and 50 pieces of the wrong size. The buyer ordered
    // a grid; this is a claim waiting to happen.
    const result = packingMismatches(ordered, {
      'Black|S': 150,
      'Black|M': 150,
      'White|S': 100,
    })

    expect(result.matches).toBe(false)
    expect(result.totalOrdered).toBe(400)
    expect(result.totalPacked).toBe(400)
    // Sorted by cell, so the report reads the same way every time it is generated.
    expect(result.mismatches).toEqual([
      { cell: 'Black|M', ordered: 200, packed: 150, variance: -50 },
      { cell: 'Black|S', ordered: 100, packed: 150, variance: 50 },
    ])
  })

  it('9 · reports a cell that was ordered but never packed', () => {
    const result = packingMismatches(ordered, { 'Black|S': 100, 'Black|M': 200 })
    expect(result.mismatches).toEqual([
      { cell: 'White|S', ordered: 100, packed: 0, variance: -100 },
    ])
  })

  it('10 · reports a packed cell that was never ordered', () => {
    const result = packingMismatches(ordered, { ...ordered, 'Red|S': 20 })
    expect(result.mismatches).toEqual([{ cell: 'Red|S', ordered: 0, packed: 20, variance: 20 }])
  })
})

describe('lcToleranceCheck · a band, not a ceiling', () => {
  it('11 · accepts a shipment inside the band', () => {
    // 5% of 1,000 permits 950–1,050.
    const result = lcToleranceCheck({ lcQty: 1000, shippedQty: 1020, tolerancePct: '5' })

    expect(result.withinTolerance).toBe(true)
    expect(result.minQty).toBe(950)
    expect(result.maxQty).toBe(1050)
  })

  it('12 · catches an over-shipment', () => {
    const result = lcToleranceCheck({ lcQty: 1000, shippedQty: 1060, tolerancePct: '5' })

    expect(result.withinTolerance).toBe(false)
    expect(result.direction).toBe('over')
    expect(result.varianceQty).toBe(10)
  })

  it('13 · catches a SHORT shipment — the half everyone forgets', () => {
    // A bank can refuse the documents on a short shipment exactly as on an over-shipment.
    // A check that only looks upward misses half of them.
    const result = lcToleranceCheck({ lcQty: 1000, shippedQty: 900, tolerancePct: '5' })

    expect(result.withinTolerance).toBe(false)
    expect(result.direction).toBe('short')
    expect(result.varianceQty).toBe(50)
  })

  it('14 · a zero tolerance means exactly the LC quantity', () => {
    expect(lcToleranceCheck({ lcQty: 1000, shippedQty: 1000, tolerancePct: '0' }).withinTolerance).toBe(
      true,
    )
    expect(lcToleranceCheck({ lcQty: 1000, shippedQty: 1001, tolerancePct: '0' }).withinTolerance).toBe(
      false,
    )
  })

  it('15 · the band edges are inclusive', () => {
    // 950 and 1,050 are permitted, not one short of permitted.
    expect(lcToleranceCheck({ lcQty: 1000, shippedQty: 950, tolerancePct: '5' }).withinTolerance).toBe(
      true,
    )
    expect(lcToleranceCheck({ lcQty: 1000, shippedQty: 1050, tolerancePct: '5' }).withinTolerance).toBe(
      true,
    )
  })

  it('16 · rounds the band in the direction that does not invent permission', () => {
    // 3% of 1,000 is 30 exactly, but 3% of 1,015 is 30.45. Half a garment cannot ship, so
    // the ceiling floors and the floor ceils — the band never grows by rounding.
    const result = lcToleranceCheck({ lcQty: 1015, shippedQty: 1045, tolerancePct: '3' })
    expect(result.maxQty).toBe(1045)
    expect(result.minQty).toBe(985)
  })

  it('17 · refuses a non-positive LC quantity', () => {
    expect(() => lcToleranceCheck({ lcQty: 0, shippedQty: 10, tolerancePct: '5' })).toThrow(
      ShipmentError,
    )
  })
})

describe('cartonCbm and chargeableWeightKg', () => {
  it('18 · CBM is length × width × height in centimetres, over a million', () => {
    // 60 × 40 × 30 cm = 72,000 cm³ = 0.072 CBM.
    expect(cartonCbm({ lengthCm: '60', widthCm: '40', heightCm: '30' })).toBe('0.072000')
  })

  it('19 · refuses a carton with a zero dimension', () => {
    expect(() => cartonCbm({ lengthCm: '60', widthCm: '0', heightCm: '30' })).toThrow(
      ShipmentError,
    )
  })

  it('20 · sea freight charges on the greater of CBM and weight-tonnes', () => {
    // A 0.072 CBM carton weighing 12 kg: 0.072 revenue tonnes against 0.012, so volume
    // wins. Quoting on gross kilos understates the bill on every light carton.
    const result = chargeableWeightKg({
      mode: 'sea',
      grossKg: '12.00',
      cbm: '0.072000',
    })

    expect(result.basis).toBe('volumetric')
    expect(result.chargeableUnits).toBe('0.072000')
    expect(result.unit).toBe('revenue_tonne')
  })

  it('21 · a dense carton is charged on its weight', () => {
    // 0.072 CBM but 150 kg — 0.150 revenue tonnes beats 0.072.
    const result = chargeableWeightKg({ mode: 'sea', grossKg: '150.00', cbm: '0.072000' })
    expect(result.basis).toBe('actual')
    expect(result.chargeableUnits).toBe('0.150000')
  })

  it('22 · air freight divides volume by the IATA factor, in kilos', () => {
    // 72,000 cm³ / 6,000 = 12 volumetric kg against a 9 kg actual weight.
    const result = chargeableWeightKg({
      mode: 'air',
      grossKg: '9.00',
      cbm: '0.072000',
    })

    expect(result.basis).toBe('volumetric')
    expect(result.chargeableUnits).toBe('12.00')
    expect(result.unit).toBe('kg')
  })

  it('23 · air freight uses the actual weight when it is heavier', () => {
    const result = chargeableWeightKg({ mode: 'air', grossKg: '20.00', cbm: '0.072000' })
    expect(result.basis).toBe('actual')
    expect(result.chargeableUnits).toBe('20.00')
  })
})

describe('latestShipmentCountdown · on the UNSHIPPED balance', () => {
  it('24 · counts days to the LC deadline', () => {
    const result = latestShipmentCountdown({
      latestShipmentDate: '2026-08-15',
      today: '2026-07-30',
      unshippedQty: 5000,
    })

    expect(result.daysRemaining).toBe(16)
    expect(result.breached).toBe(false)
  })

  it('25 · a passed deadline with a balance outstanding is a breach', () => {
    const result = latestShipmentCountdown({
      latestShipmentDate: '2026-07-25',
      today: '2026-07-30',
      unshippedQty: 5000,
    })

    expect(result.breached).toBe(true)
    expect(result.daysRemaining).toBe(-5)
  })

  it('26 · goes quiet once nothing is left to ship', () => {
    // The deadline is past, but everything shipped before it. A countdown that keeps
    // firing on a fully-shipped order trains people to ignore it.
    const result = latestShipmentCountdown({
      latestShipmentDate: '2026-07-25',
      today: '2026-07-30',
      unshippedQty: 0,
    })

    expect(result.breached).toBe(false)
    expect(result.relevant).toBe(false)
  })

  it('27 · an LC with no latest-shipment date cannot be counted down', () => {
    // Silently treating "no date" as "no deadline" is how an unshipped balance sits past a
    // date somebody forgot to enter.
    const result = latestShipmentCountdown({
      latestShipmentDate: null,
      today: '2026-07-30',
      unshippedQty: 5000,
    })

    expect(result.relevant).toBe(false)
    expect(result.reasonKey).toBe('shipment.countdown.no_latest_shipment_date')
  })
})
