/**
 * The dossier additions' payload rules (HANDOFF-orders-dossier-additions).
 *
 * The service-level behaviours — tolerance on Σqty, the settled-order refusal, the
 * ex-factory move — ride on `checkBreakdownTotal` and `withTenantTx` paths already
 * covered elsewhere; what needs pinning here is the payload grammar, because a
 * silently-accepted duplicate drop number is one drop overwriting another.
 */
import { describe, expect, it } from 'vitest'

import { saveDropsPayload, setColourApprovalPayload, setFabricLegPayload } from '../zod'

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
