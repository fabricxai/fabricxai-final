/**
 * The dossier additions' payload rules (HANDOFF-orders-dossier-additions).
 *
 * The service-level behaviours — tolerance on Σqty, the settled-order refusal, the
 * ex-factory move — ride on `checkBreakdownTotal` and `withTenantTx` paths already
 * covered elsewhere; what needs pinning here is the payload grammar, because a
 * silently-accepted duplicate drop number is one drop overwriting another.
 */
import { describe, expect, it } from 'vitest'

import {
  breakdownCell,
  saveBreakdownPayload,
  saveDropsPayload,
  setColourApprovalPayload,
  setFabricLegPayload,
} from '../zod'

const ORDER = '4f9b1f6a-3c3e-4a1e-9b1a-2a4b5c6d7e8f'

describe('saveDropsPayload', () => {
  it('accepts a two-drop plan', () => {
    const parsed = saveDropsPayload.parse({
      orderId: ORDER,
      drops: [
        { dropNo: 1, qty: 14000, shipDate: '2026-09-09' },
        { dropNo: 2, qty: 10000, shipDate: '2026-09-16', note: 'balance' },
      ],
    })
    expect(parsed.drops).toHaveLength(2)
  })

  it('refuses a duplicated drop number — one drop must not overwrite another', () => {
    expect(() =>
      saveDropsPayload.parse({
        orderId: ORDER,
        drops: [
          { dropNo: 1, qty: 1000, shipDate: '2026-09-09' },
          { dropNo: 1, qty: 2000, shipDate: '2026-09-16' },
        ],
      }),
    ).toThrow(/appears twice/)
  })

  it('refuses an empty plan and a non-positive quantity', () => {
    expect(() => saveDropsPayload.parse({ orderId: ORDER, drops: [] })).toThrow()
    expect(() =>
      saveDropsPayload.parse({
        orderId: ORDER,
        drops: [{ dropNo: 1, qty: 0, shipDate: '2026-09-09' }],
      }),
    ).toThrow()
  })
})

describe('setFabricLegPayload', () => {
  it('accepts a leg with any of the three voices, and refuses one off the map', () => {
    expect(setFabricLegPayload.parse({ orderId: ORDER, leg: 'ex_mill', note: 'four days lost' }).leg).toBe('ex_mill')
    expect(() => setFabricLegPayload.parse({ orderId: ORDER, leg: 'teleported' })).toThrow()
  })
})

describe('setColourApprovalPayload', () => {
  it('accepts a stage decision and refuses an unknown stage', () => {
    const parsed = setColourApprovalPayload.parse({
      orderId: ORDER,
      color: 'Navy',
      stage: 'shade_band',
      status: 'sent',
    })
    expect(parsed.status).toBe('sent')
    expect(() =>
      setColourApprovalPayload.parse({ orderId: ORDER, color: 'Navy', stage: 'vibe_check', status: 'sent' }),
    ).toThrow()
  })
})

/**
 * The third axis (HANDOFF-orders-dossier-additions §8).
 *
 * `variant` decides the grid's unique cell key, so its DEFAULTING is load-bearing in a
 * way an ordinary optional field is not: every caller written before the column existed
 * — the seeds, the demo, the RFQ-to-order path — sends cells without it, and each of
 * those must land on the same key as a cell that sends an empty string. If the default
 * ever became `undefined`, half the writers would collide with the other half's rows
 * and the duplicate check would start refusing legitimate cells.
 */
describe('breakdownCell · the third axis', () => {
  it('defaults to no third axis, so a caller that never heard of it stays valid', () => {
    const cell = breakdownCell.parse({ color: 'Cream', size: '12', qty: 1680 })
    expect(cell.variant).toBe('')
  })

  it('keeps a variant it is given, trimmed', () => {
    const cell = breakdownCell.parse({ color: 'Cream', size: '12', variant: '  Drop 1 ', qty: 840 })
    expect(cell.variant).toBe('Drop 1')
  })

  it('refuses a variant longer than the column holds', () => {
    expect(() =>
      breakdownCell.parse({ color: 'Cream', size: '12', variant: 'x'.repeat(41), qty: 10 }),
    ).toThrow()
  })

  it('lets the same colour and size appear twice under different variants', () => {
    // The real case this exists for: one PO line ships in October, the other a week
    // later, and both are Cream/12. Without the third axis the second is a duplicate.
    const parsed = saveBreakdownPayload.parse({
      orderStyleId: ORDER,
      cells: [
        { color: 'Cream', size: '12', variant: 'Drop 1', qty: 1680 },
        { color: 'Cream', size: '12', variant: 'Drop 2', qty: 840 },
      ],
    })
    const keys = parsed.cells.map((c) => `${c.color}/${c.size}/${c.variant}`)
    expect(new Set(keys).size).toBe(2)
  })
})
