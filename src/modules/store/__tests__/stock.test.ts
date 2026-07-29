/**
 * Store stock vectors — written before the implementation.
 *
 * Three computations a fabric store lives or dies by:
 *
 *  1. **free = on-hand − reserved.** Architecture §4 is explicit that free is computed,
 *     never stored: "multi-order contention is the normal state". A stored free balance
 *     drifts the moment two merchandisers reserve against the same roll.
 *  2. **Requisition sizing** — consumption × order quantity × (1 + wastage). Under-issue
 *     and the line stops; over-issue and the margin goes.
 *  3. **Shade mixing** — a garment cut from two dye lots is a rejection at final
 *     inspection. The brief is explicit that this WARNS rather than blocks: sometimes
 *     mixing is the right call and the storekeeper knows why.
 */
import { describe, expect, it } from 'vitest'

import {
  checkShadeMix,
  computeRequisitionLines,
  computeStock,
  StoreError,
  type ReservationInput,
  type RollInput,
} from '../stock'

const rolls: RollInput[] = [
  { rollId: 'r1', itemId: 'FAB-A', qty: '120.50', unit: 'M', status: 'in_stock', locationId: 'bond-1', shadeGroup: 'A' },
  { rollId: 'r2', itemId: 'FAB-A', qty: '80.00', unit: 'M', status: 'in_stock', locationId: 'bond-1', shadeGroup: 'A' },
  { rollId: 'r3', itemId: 'FAB-A', qty: '60.00', unit: 'M', status: 'issued', locationId: 'floor-1', shadeGroup: 'B' },
  { rollId: 'r4', itemId: 'TRM-B', qty: '5000.00', unit: 'PCS', status: 'in_stock', locationId: 'gen-1', shadeGroup: null },
]

describe('computeStock · free is computed, never stored', () => {
  it('1 · counts only rolls that are actually in stock', () => {
    const stock = computeStock({ rolls, reservations: [] })

    // r3 has been issued — it is on the floor, not in the store.
    expect(stock.get('FAB-A')).toMatchObject({ onHand: '200.50', reserved: '0.00', free: '200.50' })
    expect(stock.get('TRM-B')).toMatchObject({ onHand: '5000.00', free: '5000.00' })
  })

  it('2 · subtracts open reservations to give free', () => {
    const reservations: ReservationInput[] = [
      { itemId: 'FAB-A', qty: '75.00', unit: 'M', status: 'open' },
      { itemId: 'FAB-A', qty: '25.50', unit: 'M', status: 'open' },
    ]

    const stock = computeStock({ rolls, reservations })
    expect(stock.get('FAB-A')).toMatchObject({
      onHand: '200.50',
      reserved: '100.50',
      free: '100.00',
    })
  })

  it('3 · ignores reservations that are already closed', () => {
    const stock = computeStock({
      rolls,
      reservations: [
        { itemId: 'FAB-A', qty: '75.00', unit: 'M', status: 'open' },
        { itemId: 'FAB-A', qty: '50.00', unit: 'M', status: 'fulfilled' },
        { itemId: 'FAB-A', qty: '30.00', unit: 'M', status: 'cancelled' },
      ],
    })

    expect(stock.get('FAB-A')?.reserved).toBe('75.00')
  })

  it('4 · reports negative free rather than clamping it', () => {
    // Over-reserved is a real and important state: two orders have promised the same
    // cloth. Clamping to zero would hide exactly the contention the planner needs to see.
    const stock = computeStock({
      rolls,
      reservations: [{ itemId: 'FAB-A', qty: '500.00', unit: 'M', status: 'open' }],
    })

    expect(stock.get('FAB-A')).toMatchObject({ free: '-299.50', overReserved: true })
  })

  it('5 · breaks down by location, because a bonded roll is not a general one', () => {
    const stock = computeStock({ rolls, reservations: [] })
    expect(stock.get('FAB-A')?.byLocation).toEqual({ 'bond-1': '200.50' })
  })

  it('6 · refuses to add two different units for the same item', () => {
    // An item recorded in both metres and kilograms means the UoM is wrong somewhere,
    // and summing them would produce a confident, meaningless number.
    expect(() =>
      computeStock({
        rolls: [
          { rollId: 'x', itemId: 'FAB-A', qty: '10.00', unit: 'M', status: 'in_stock', locationId: 'l', shadeGroup: null },
          { rollId: 'y', itemId: 'FAB-A', qty: '10.00', unit: 'KG', status: 'in_stock', locationId: 'l', shadeGroup: null },
        ],
        reservations: [],
      }),
    ).toThrow(/unit/i)
  })

  it('7 · is exact — no float ever touches a roll quantity', () => {
    const stock = computeStock({
      rolls: [
        { rollId: 'a', itemId: 'F', qty: '0.10', unit: 'M', status: 'in_stock', locationId: 'l', shadeGroup: null },
        { rollId: 'b', itemId: 'F', qty: '0.20', unit: 'M', status: 'in_stock', locationId: 'l', shadeGroup: null },
      ],
      reservations: [],
    })

    expect(stock.get('F')?.onHand).toBe('0.30')
  })
})

describe('computeRequisitionLines · what to issue', () => {
  it('8 · required = consumption per piece × order quantity × (1 + wastage)', () => {
    const lines = computeRequisitionLines({
      orderQty: 1200,
      wastagePct: '5',
      lines: [{ itemId: 'FAB-A', consumptionPerPiece: '1.45', unit: 'M' }],
    })

    // 1.45 × 1200 = 1740; +5% = 1827
    expect(lines[0]).toMatchObject({ itemId: 'FAB-A', requiredQty: '1827.00', unit: 'M' })
  })

  it('9 · handles zero wastage', () => {
    const lines = computeRequisitionLines({
      orderQty: 1000,
      wastagePct: '0',
      lines: [{ itemId: 'TRM-B', consumptionPerPiece: '6', unit: 'PCS' }],
    })

    expect(lines[0]?.requiredQty).toBe('6000.00')
  })

  it('10 · is exact on awkward consumption figures', () => {
    // 0.333 per piece would silently truncate at 2dp; the caller must round first.
    expect(() =>
      computeRequisitionLines({
        orderQty: 1000,
        wastagePct: '0',
        lines: [{ itemId: 'F', consumptionPerPiece: '0.333', unit: 'M' }],
      }),
    ).toThrow(/decimal places/i)
  })

  it('11 · refuses a negative order quantity or wastage', () => {
    expect(() =>
      computeRequisitionLines({
        orderQty: -5,
        wastagePct: '0',
        lines: [{ itemId: 'F', consumptionPerPiece: '1.00', unit: 'M' }],
      }),
    ).toThrow(StoreError)

    expect(() =>
      computeRequisitionLines({
        orderQty: 100,
        wastagePct: '-5',
        lines: [{ itemId: 'F', consumptionPerPiece: '1.00', unit: 'M' }],
      }),
    ).toThrow(StoreError)
  })
})

describe('checkShadeMix · warn, never block', () => {
  it('12 · is quiet when the picked shade matches what the order already has', () => {
    const result = checkShadeMix({ alreadyIssued: ['A'], picking: ['A'] })
    expect(result.mixed).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('13 · warns when a second shade group joins an order', () => {
    // A garment cut from two dye lots is a rejection at final inspection. But the brief
    // says the UI decides — sometimes mixing across a size break is deliberate.
    const result = checkShadeMix({ alreadyIssued: ['A'], picking: ['B'] })

    expect(result.mixed).toBe(true)
    expect(result.warnings[0]).toMatchObject({
      code: 'shade_mix',
      messageKey: 'store.warnings.shade_mix',
    })
    expect(result.warnings[0]?.facts).toMatchObject({ existing: ['A'], picked: ['B'] })
  })

  it('14 · warns when a single issue mixes shades within itself', () => {
    const result = checkShadeMix({ alreadyIssued: [], picking: ['A', 'B'] })
    expect(result.mixed).toBe(true)
  })

  it('15 · ignores rolls with no shade group — trims do not have one', () => {
    const result = checkShadeMix({ alreadyIssued: [], picking: [null, null] })
    expect(result.mixed).toBe(false)
  })
})
