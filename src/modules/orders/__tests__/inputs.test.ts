/**
 * The In-House Check List's one real rule: what the roll-up counts.
 *
 * The factory's sheet has twelve columns whether or not a style uses them. A naive
 * N/12 makes a style with no zipper read forever unfinished and a style with
 * everything landed read 11/12 — the design review caught exactly that mistake in
 * the mockups, three roll-ups wrong under every possible rule, which is why the
 * rule lives in one pure function and this file pins it.
 */
import { describe, expect, it } from 'vitest'

import { fillCategories, rollupInputs, type InputCell } from '../inputs'
import { INPUT_CATEGORIES, setInputCellPayload } from '../zod'

const TODAY = '2026-08-23'

function cell(partial: Partial<InputCell> & { category: InputCell['category'] }): InputCell {
  return { state: 'pending', planDate: null, actualDate: null, note: null, ...partial }
}

describe('fillCategories', () => {
  it('renders an untouched order as twelve open questions, not a blank', () => {
    const filled = fillCategories([])
    expect(filled).toHaveLength(INPUT_CATEGORIES.length)
    expect(filled.every((c) => c.state === 'pending')).toBe(true)
  })

  it('keeps the sheet column order regardless of write order', () => {
    const filled = fillCategories([cell({ category: 'zipper' }), cell({ category: 'fabric' })])
    expect(filled.map((c) => c.category)).toEqual([...INPUT_CATEGORIES])
  })
})

describe('rollupInputs', () => {
  it('counts against the categories the style uses, not against twelve', () => {
    const cells = fillCategories([
      cell({ category: 'fabric', state: 'in_house', actualDate: '2026-08-01' }),
      cell({ category: 'zipper', state: 'not_applicable' }),
      cell({ category: 'elastic', state: 'not_applicable' }),
      cell({ category: 'hook_bar', state: 'not_applicable' }),
    ])
    const rollup = rollupInputs(cells, TODAY)
    expect(rollup.applicable).toBe(9)
    expect(rollup.inHouse).toBe(1)
  })

  it('reads complete only when every applicable cell is in-house', () => {
    const allIn = INPUT_CATEGORIES.map((category) =>
      category === 'zipper'
        ? cell({ category, state: 'not_applicable' })
        : cell({ category, state: 'in_house', actualDate: '2026-08-01' }),
    )
    expect(rollupInputs(allIn, TODAY).complete).toBe(true)

    const oneBooked = allIn.map((c) =>
      c.category === 'thread' ? cell({ category: 'thread', state: 'booked' }) : c,
    )
    expect(rollupInputs(oneBooked, TODAY).complete).toBe(false)
  })

  it('a not_applicable-only order is never "complete" — nothing was achieved', () => {
    const cells = INPUT_CATEGORIES.map((category) => cell({ category, state: 'not_applicable' }))
    const rollup = rollupInputs(cells, TODAY)
    expect(rollup.applicable).toBe(0)
    expect(rollup.complete).toBe(false)
  })

  it('counts late two ways: landed after plan, and planned but absent past it', () => {
    const cells = fillCategories([
      // Landed, four days after its plan — late even though it is in.
      cell({ category: 'fabric', state: 'in_house', planDate: '2026-07-28', actualDate: '2026-08-01' }),
      // Booked, planned for last week, still not in — late.
      cell({ category: 'thread', state: 'booked', planDate: '2026-08-15' }),
      // Planned for tomorrow — not late.
      cell({ category: 'buttons', state: 'booked', planDate: '2026-08-24' }),
      // No plan date at all — cannot be late against a date nobody set.
      cell({ category: 'labels', state: 'pending' }),
    ])
    expect(rollupInputs(cells, TODAY).late).toBe(2)
  })
})

describe('setInputCellPayload', () => {
  const base = { orderId: '4f9b1f6a-3c3e-4a1e-9b1a-2a4b5c6d7e8f', category: 'fabric', state: 'booked' }

  it('accepts the sheet cell in all three voices — date, word, note', () => {
    expect(setInputCellPayload.parse({ ...base, planDate: '2026-08-30' }).planDate).toBe('2026-08-30')
    expect(setInputCellPayload.parse({ ...base, note: '101 rolls short' }).note).toBe('101 rolls short')
    expect(setInputCellPayload.parse(base).state).toBe('booked')
  })

  it('refuses an actual date on a cell that is not in-house', () => {
    expect(() =>
      setInputCellPayload.parse({ ...base, state: 'booked', actualDate: '2026-08-01' }),
    ).toThrow(/in-house/)
    expect(
      setInputCellPayload.parse({ ...base, state: 'in_house', actualDate: '2026-08-01' }).actualDate,
    ).toBe('2026-08-01')
  })

  it('refuses a category outside the registered vocabulary', () => {
    expect(() => setInputCellPayload.parse({ ...base, category: 'sequins' })).toThrow()
  })
})
