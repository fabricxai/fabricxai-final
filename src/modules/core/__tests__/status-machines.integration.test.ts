/**
 * The machines added for the ⚖ status columns that were set by raw update (audit BE-M1).
 *
 * What is asserted here is the transition TABLE, because that is the part somebody edits
 * without thinking about the gate reading it. Each case names what goes wrong on the floor
 * if the move were allowed — a list of arrows tells the next reader nothing.
 *
 * An integration test only because these machines are exported from service files that
 * import the database client, so loading them needs the environment. Nothing here touches
 * a table.
 */
import { describe, expect, it } from 'vitest'

import { udMachine } from '@/modules/commercial/service'
import { payableMachine, receivableMachine } from '@/modules/finance/service'
import { rollMachine } from '@/modules/store/service'
import { gazetteMachine } from '@/modules/workforce/service'

const illegal = (fn: () => void) =>
  expect(fn).toThrowError(expect.objectContaining({ status: 409, code: 'illegal_transition' }))

describe('uds.status — the gate reads this to allow a bonded draw', () => {
  it('lets a live declaration be used up or lapse', () => {
    expect(() => udMachine.assert('active', 'exhausted')).not.toThrow()
    expect(() => udMachine.assert('active', 'expired')).not.toThrow()
  })

  it('refuses to revive a dead declaration', () => {
    // The exposure this prevents: duty-free fabric drawn against a permission that has
    // already expired, which is the thing customs actually checks.
    illegal(() => udMachine.assert('expired', 'active'))
    illegal(() => udMachine.assert('exhausted', 'active'))
    illegal(() => udMachine.assert('closed', 'active'))
  })

  it('still lets an exhausted declaration lapse', () => {
    // Quantity and time are separate facts; the record should say which ended it.
    expect(() => udMachine.assert('exhausted', 'expired')).not.toThrow()
  })
})

describe('rolls.status — the same fabric must not exist twice', () => {
  it('issues from stock and takes returns back', () => {
    expect(() => rollMachine.assert('in_stock', 'issued')).not.toThrow()
    expect(() => rollMachine.assert('issued', 'returned')).not.toThrow()
    expect(() => rollMachine.assert('returned', 'issued')).not.toThrow()
  })

  it('refuses to issue a roll that is already out', () => {
    // Otherwise the roll is on the cutting floor and in the store at once.
    illegal(() => rollMachine.assert('issued', 'issued'))
  })

  it('will not resurrect a written-off roll', () => {
    illegal(() => rollMachine.assert('adjusted_out', 'in_stock'))
  })
})

describe('wage_gazettes.status — what June is recomputed against', () => {
  it('goes draft, active, superseded', () => {
    expect(() => gazetteMachine.assert('draft', 'active')).not.toThrow()
    expect(() => gazetteMachine.assert('active', 'superseded')).not.toThrow()
  })

  it('refuses to reactivate a superseded gazette', () => {
    // Superseded is not "wrong" — it still governs every period before the new one's
    // effective date. Reactivating it would repay old months at new rates.
    illegal(() => gazetteMachine.assert('superseded', 'active'))
  })

  it('refuses to activate straight from nothing', () => {
    illegal(() => gazetteMachine.assert('draft', 'superseded'))
  })
})

describe('receivables and payables — settled means settled', () => {
  it('closes from open or part', () => {
    expect(() => receivableMachine.assert('open', 'realized')).not.toThrow()
    expect(() => receivableMachine.assert('part_realized', 'realized')).not.toThrow()
    expect(() => payableMachine.assert('open', 'part_paid')).not.toThrow()
    expect(() => payableMachine.assert('part_paid', 'paid')).not.toThrow()
  })

  it('refuses to reopen settled money', () => {
    // A correction after settlement is a new document, not a status moved backwards —
    // otherwise the ledger disagrees with the bank and nothing says when it changed.
    illegal(() => receivableMachine.assert('realized', 'open'))
    illegal(() => receivableMachine.assert('written_off', 'realized'))
    illegal(() => payableMachine.assert('paid', 'part_paid'))
    illegal(() => payableMachine.assert('cancelled', 'open'))
  })
})
