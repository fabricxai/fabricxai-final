import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { readJsonbArray, readJsonbObject } from '../jsonb'

/**
 * The behaviour under test is mostly about what does NOT happen: a malformed
 * entry must not vanish, and an unparseable column must not look empty.
 */
describe('readJsonbArray', () => {
  const dep = z.union([
    z.string().transform((name) => ({ name, gapDays: null as number | null })),
    z.object({ name: z.string(), gapDays: z.number().nullable().default(null) }),
  ])

  it('accepts both shapes the TNA engine actually writes', () => {
    const result = readJsonbArray(dep, ['trims_in_house', { name: 'pp_approval', gapDays: 4 }], 't')

    expect(result.unreadable).toBe(0)
    expect(result.items).toEqual([
      { name: 'trims_in_house', gapDays: null },
      { name: 'pp_approval', gapDays: 4 },
    ])
  })

  it('counts a malformed entry instead of dropping it silently', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    // This is the bug the helper exists to prevent: a reader that filtered to
    // strings would return one item and report nothing wrong.
    const result = readJsonbArray(dep, ['ok', { gapDays: 4 }], 'drop-test')

    expect(result.items).toHaveLength(1)
    expect(result.unreadable).toBe(1)
  })

  it('keeps the good entries when one is bad', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = readJsonbArray(dep, ['a', 42, 'b'], 'partial-test')

    expect(result.items.map((i) => i.name)).toEqual(['a', 'b'])
    expect(result.unreadable).toBe(1)
  })

  it('treats a non-array as unreadable rather than empty', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = readJsonbArray(dep, { name: 'x' }, 'shape-test')

    expect(result.items).toEqual([])
    expect(result.unreadable).toBe(1)
  })

  it('reports a genuinely empty column as empty, not unreadable', () => {
    expect(readJsonbArray(dep, [], 't')).toEqual({ items: [], unreadable: 0 })
    expect(readJsonbArray(dep, null, 't')).toEqual({ items: [], unreadable: 0 })
  })
})

describe('readJsonbObject', () => {
  const confidence = z.record(z.string(), z.number().min(0).max(1))

  it('parses a well-formed map', () => {
    expect(readJsonbObject(confidence, { qty: 0.84 }, 't')).toEqual({ qty: 0.84 })
  })

  it('distinguishes an empty map from an unparseable one', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    // {} means a human wrote the draft. null means we could not tell.
    expect(readJsonbObject(confidence, {}, 't')).toEqual({})
    expect(readJsonbObject(confidence, { qty: 'high' }, 'bad-conf')).toBeNull()
  })

  it('returns null for a missing column rather than inventing one', () => {
    expect(readJsonbObject(confidence, null, 't')).toBeNull()
  })
})
