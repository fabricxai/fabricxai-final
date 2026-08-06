/**
 * The decimal-string helpers that replaced the float spellings the no-float-money rule
 * could not see (audit BE-B3). Each test name says what a float would have got wrong.
 */
import { describe, expect, it } from 'vitest'

import {
  QuantityError,
  compareDecimalStrings,
  ratioAsPercent,
  subtractDecimalStrings,
  toMinor,
  toMinorAtScale,
} from '@/lib/quantity'

describe('subtractDecimalStrings', () => {
  it('keeps the finer scale of the two operands', () => {
    expect(subtractDecimalStrings('100', '12.35')).toBe('87.65')
    expect(subtractDecimalStrings('1.4523', '0.45')).toBe('1.0023')
  })

  it('carries the sign instead of clamping', () => {
    expect(subtractDecimalStrings('10.00', '12.50')).toBe('-2.50')
    expect(subtractDecimalStrings('-1.5', '-2.5')).toBe('1.0')
  })

  it('integer minus integer stays an integer string', () => {
    expect(subtractDecimalStrings('100', '30')).toBe('70')
  })

  it('is exact where floats are not', () => {
    // 0.1 + 0.2 territory: 0.3 − 0.1 is 0.19999999999999998 as floats.
    expect(subtractDecimalStrings('0.3', '0.1')).toBe('0.2')
  })

  it('refuses a non-decimal', () => {
    expect(() => subtractDecimalStrings('12,50', '1')).toThrow(QuantityError)
  })
})

describe('compareDecimalStrings', () => {
  it('compares across different scales', () => {
    expect(compareDecimalStrings('12.5', '12.50')).toBe(0)
    expect(compareDecimalStrings('12.51', '12.5')).toBe(1)
    expect(compareDecimalStrings('12.49', '12.5')).toBe(-1)
  })

  it('handles signs', () => {
    expect(compareDecimalStrings('-0.01', '0')).toBe(-1)
    expect(compareDecimalStrings('0.00', '-0.00')).toBe(0)
  })

  it('is exact beyond float precision', () => {
    // Identical as doubles (both round to the same 64-bit float), different as numbers.
    expect(compareDecimalStrings('9007199254740993', '9007199254740992')).toBe(1)
  })
})

describe('ratioAsPercent', () => {
  it('computes the BTB-style utilisation figure', () => {
    expect(ratioAsPercent('75.00', '100.00')).toBe('75.0')
    expect(ratioAsPercent('1', '3')).toBe('33.3')
  })

  it('rounds half-up exactly once', () => {
    expect(ratioAsPercent('0.05', '100')).toBe('0.1')
    // 2/3 = 66.66…% — half-up at one decimal is 66.7.
    expect(ratioAsPercent('2', '3')).toBe('66.7')
  })

  it('a zero denominator is null, not 0% and not an exception', () => {
    expect(ratioAsPercent('10', '0')).toBeNull()
    expect(ratioAsPercent('10', '0.00')).toBeNull()
  })

  it('honours the decimals parameter, including 0', () => {
    expect(ratioAsPercent('1', '3', 0)).toBe('33')
    expect(ratioAsPercent('1', '3', 3)).toBe('33.333')
  })

  it('keeps the sign of the ratio', () => {
    expect(ratioAsPercent('-25', '100')).toBe('-25.0')
    expect(ratioAsPercent('25', '-100')).toBe('-25.0')
  })
})

describe('toMinorAtScale · a consumption is not a stock figure', () => {
  it('reads four decimals, which is what the column stores', () => {
    /*
     * `bom_lines.consumption` is `numeric(12, 4)`. The schema decided four decimals; the
     * costing arithmetic read two, and a trims line of 0.0083 kg per piece — thread, an
     * entirely ordinary figure — truncated to 0.00. That line then contributed NOTHING to
     * the quoted price and nothing to the realised margin, silently, for the life of the
     * module (plan 2.9).
     */
    expect(toMinorAtScale('0.0083', 4)).toBe(83n)
    expect(toMinorAtScale('1.5500', 4)).toBe(15_500n)
    expect(toMinorAtScale('-0.0083', 4)).toBe(-83n)
  })

  it('agrees with toMinor at scale 2', () => {
    // Guards the guard: if the two disagreed, every value the old code COULD represent would
    // have quietly changed price when this landed.
    for (const value of ['0.00', '1.55', '12.34', '-7.80', '1000.05']) {
      expect(toMinorAtScale(value, 2), value).toBe(toMinor(value))
    }
  })

  it('still refuses a digit it would have to drop', () => {
    // The refusal is the whole reason the bug surfaced. A converter that silently truncated
    // at scale 4 would just move the same failure two decimal places along.
    expect(() => toMinorAtScale('0.00831', 4)).toThrow(QuantityError)
    expect(() => toMinorAtScale('0.00831', 4)).toThrow(/more than 4 decimal places/)
    // A trailing zero drops nothing, so it is accepted.
    expect(toMinorAtScale('0.00830', 4)).toBe(83n)
  })

  it('refuses a scale that is not a usable number of places', () => {
    expect(() => toMinorAtScale('1.0', -1)).toThrow(QuantityError)
    expect(() => toMinorAtScale('1.0', 1.5)).toThrow(QuantityError)
  })

  it('reads a whole number at any scale', () => {
    expect(toMinorAtScale('12', 4)).toBe(120_000n)
    expect(toMinorAtScale('12', 0)).toBe(12n)
  })
})
