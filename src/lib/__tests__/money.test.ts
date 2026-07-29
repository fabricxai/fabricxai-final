import { describe, expect, it } from 'vitest'

import { add, compare, divide, format, money, mulDiv, multiply, subtract, sum, zero } from '../money'

describe('money', () => {
  it('normalises to two decimal places', () => {
    expect(money('5', 'USD').amount).toBe('5.00')
    expect(money('5.1', 'USD').amount).toBe('5.10')
    expect(money(1250, 'BDT').amount).toBe('1250.00')
    expect(money('-0.5', 'USD').amount).toBe('-0.50')
  })

  it('adds without float drift — the whole reason this module exists', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float. Not here.
    expect(add(money('0.10', 'USD'), money('0.20', 'USD')).amount).toBe('0.30')
    expect(sum([money('0.01', 'USD'), money('0.02', 'USD'), money('0.07', 'USD')]).amount).toBe(
      '0.10',
    )
  })

  it('subtracts across zero', () => {
    expect(subtract(money('10.00', 'USD'), money('12.50', 'USD')).amount).toBe('-2.50')
  })

  it('multiplies by a decimal rate, rounding half up', () => {
    // 12.99 × 3 pieces
    expect(multiply(money('12.99', 'USD'), 3).amount).toBe('38.97')
    // 15% VAT on 100.00
    expect(multiply(money('100.00', 'BDT'), '0.15').amount).toBe('15.00')
    // 0.005 rounds away from zero, not to even
    expect(multiply(money('0.01', 'USD'), '0.5').amount).toBe('0.01')
    expect(multiply(money('-0.01', 'USD'), '0.5').amount).toBe('-0.01')
  })

  it('refuses to mix currencies rather than guessing a rate', () => {
    expect(() => add(money('1.00', 'USD'), money('1.00', 'BDT'))).toThrow(/convert explicitly/)
  })

  it('refuses precision it would have to silently discard', () => {
    expect(() => money('1.005', 'USD')).toThrow(/decimal places/)
    // Trailing zeros beyond scale are not a loss, so they are fine.
    expect(money('1.500', 'USD').amount).toBe('1.50')
  })

  it('rejects values that are not decimals', () => {
    expect(() => money('1,250.00', 'USD')).toThrow(/not a decimal/)
    expect(() => money('twelve', 'USD')).toThrow(/not a decimal/)
  })

  it('compares and sums empty lists sanely', () => {
    expect(compare(money('1.00', 'USD'), money('2.00', 'USD'))).toBe(-1)
    expect(compare(money('2.00', 'USD'), money('2.00', 'USD'))).toBe(0)
    expect(sum([], 'USD')).toEqual(zero('USD'))
    expect(() => sum([])).toThrow(/explicit currency/)
  })

  it('formats for display only', () => {
    expect(format(money('1250.5', 'USD'))).toBe('$1,250.50')
  })
})

describe('money · division for wage arithmetic', () => {
  it('divides exactly, rounding half up', () => {
    expect(divide(money('100.00', 'BDT'), 3).amount).toBe('33.33')
    expect(divide(money('10.00', 'BDT'), 4).amount).toBe('2.50')
    // 0.005 rounds away from zero, not to even.
    expect(divide(money('0.01', 'BDT'), 2).amount).toBe('0.01')
  })

  it('rounds once, not twice — the reason mulDiv exists', () => {
    // Overtime: 20 hours at 2× the hourly rate on a basic of 8,000 BDT.
    // Correct:  8000 × 40 / 208            = 1538.4615… → 1538.46
    // Naive:    round(8000/208) × 40       = 38.46 × 40 = 1538.40
    // Six paisa per worker per month is not much. Times 2,400 workers, every month,
    // it is a wage complaint with a spreadsheet attached.
    const basic = money('8000.00', 'BDT')

    expect(mulDiv(basic, 40, 208).amount).toBe('1538.46')
    expect(multiply(divide(basic, 208), 40).amount).toBe('1538.40')
  })

  it('handles decimal numerators — overtime is recorded in part hours', () => {
    // 7.5 hours of OT at 2×: 8000 × 15 / 208
    expect(mulDiv(money('8000.00', 'BDT'), '15', 208).amount).toBe('576.92')
  })

  it('refuses division by zero rather than producing Infinity', () => {
    expect(() => divide(money('100.00', 'BDT'), 0)).toThrow(/zero/i)
  })
})
