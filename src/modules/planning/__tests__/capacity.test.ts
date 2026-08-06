/**
 * Capacity vectors — written before the implementation.
 *
 * The question this module answers is the one an owner asks on the phone: "can we take
 * 40,000 pieces for August?" Getting it wrong in either direction is expensive — say no
 * and the order goes elsewhere; say yes and the factory misses a ship date it has already
 * committed to.
 *
 * The brief is explicit that `allocate()` "returns violations, doesn't silently clamp".
 * That is the whole design: a planner who is 3,000 minutes over needs to see 3,000, not a
 * plan quietly trimmed to fit.
 */
import { describe, expect, it } from 'vitest'

import { allocationMachine, scenarioMachine } from '@/modules/planning/capacity'
import {
  answerCapacityQuery,
  checkLineDayLoad,
  effectiveMinutes,
  efficiencyForDay,
  PlanningError,
  type LineDayCapacity,
  type PlannedLoad,
} from '../capacity'

const CAPACITY: LineDayCapacity = {
  lineId: 'L-07',
  date: '2026-08-03',
  shiftMinutes: 480,
  plannedDowntimeMinutes: 30,
  manpower: 40,
  expectedEfficiencyPct: '60',
}

describe('effectiveMinutes', () => {
  it('1 · available = (shift − planned downtime) × manpower, then × efficiency', () => {
    // (480 − 30) × 40 = 18,000 available; at 60% that is 10,800 earnable minutes.
    const result = effectiveMinutes(CAPACITY)
    expect(result.availableMinutes).toBe('18000.00')
    expect(result.earnableMinutes).toBe('10800.00')
  })

  it('2 · planned downtime is subtracted before manpower is applied', () => {
    // Thirty minutes of planned maintenance costs 30 × 40 operators, not 30.
    const withNone = effectiveMinutes({ ...CAPACITY, plannedDowntimeMinutes: 0 })
    expect(withNone.availableMinutes).toBe('19200.00')
  })

  it('3 · refuses a line-day with no capacity rather than reporting zero', () => {
    // A line with nobody on it is not a line running at 0% — it is a line that is not
    // running, and planning work onto it is a different mistake from planning badly.
    expect(() => effectiveMinutes({ ...CAPACITY, manpower: 0 })).toThrow(PlanningError)
    expect(() => effectiveMinutes({ ...CAPACITY, shiftMinutes: 0 })).toThrow(PlanningError)
  })

  it('4 · refuses downtime longer than the shift', () => {
    expect(() =>
      effectiveMinutes({ ...CAPACITY, plannedDowntimeMinutes: 500 }),
    ).toThrow(/downtime/i)
  })
})

describe('efficiencyForDay · the learning curve', () => {
  const curve = [
    { dayIndex: 1, efficiencyPct: '35' },
    { dayIndex: 2, efficiencyPct: '45' },
    { dayIndex: 5, efficiencyPct: '58' },
    { dayIndex: 10, efficiencyPct: '65' },
  ]

  it('5 · a new style runs slower on day one', () => {
    // Planning a new style at its steady-state efficiency is how a factory promises a
    // ship date it misses in the first week.
    expect(efficiencyForDay(curve, 1)).toBe('35')
  })

  it('6 · holds the last known point rather than extrapolating', () => {
    // Day 20 is beyond the study. Holding 65% is honest; extrapolating upward is a
    // guess that always flatters the plan.
    expect(efficiencyForDay(curve, 20)).toBe('65')
  })

  it('7 · uses the most recent point at or before the day', () => {
    expect(efficiencyForDay(curve, 4)).toBe('45')
    expect(efficiencyForDay(curve, 5)).toBe('58')
  })

  it('8 · falls back to the line default when there is no curve', () => {
    expect(efficiencyForDay([], 3, '60')).toBe('60')
  })

  it('9 · refuses to guess with neither a curve nor a default', () => {
    expect(() => efficiencyForDay([], 3)).toThrow(PlanningError)
  })
})

describe('checkLineDayLoad · violations, never a silent clamp', () => {
  const load = (over: Partial<PlannedLoad> = {}): PlannedLoad => ({
    orderId: 'ord-1',
    styleCode: 'ST-100',
    smv: '12.5',
    qty: 800,
    ...over,
  })

  it('10 · accepts a plan that fits', () => {
    // 12.5 × 800 = 10,000 earned minutes needed against 10,800 earnable.
    const result = checkLineDayLoad(CAPACITY, [load()])

    expect(result.fits).toBe(true)
    expect(result.requiredMinutes).toBe('10000.00')
    expect(result.slackMinutes).toBe('800.00')
    expect(result.violations).toEqual([])
  })

  it('11 · reports the overload instead of trimming the plan', () => {
    const result = checkLineDayLoad(CAPACITY, [load({ qty: 1000 })])

    // 12.5 × 1000 = 12,500 against 10,800 — 1,700 minutes over.
    expect(result.fits).toBe(false)
    expect(result.overloadMinutes).toBe('1700.00')
    expect(result.violations[0]).toMatchObject({
      code: 'line_day_overloaded',
      messageKey: 'planning.violations.line_day_overloaded',
    })
    // The requested quantity is echoed back untouched — nothing was clamped.
    expect(result.requiredMinutes).toBe('12500.00')
  })

  it('12 · sums several orders sharing a line-day', () => {
    const result = checkLineDayLoad(CAPACITY, [
      load({ orderId: 'a', qty: 400 }),
      load({ orderId: 'b', smv: '8', qty: 500 }),
    ])

    // 12.5×400 + 8×500 = 5,000 + 4,000 = 9,000
    expect(result.requiredMinutes).toBe('9000.00')
    expect(result.fits).toBe(true)
  })

  it('13 · flags a changeover when a line-day carries several styles', () => {
    // Every style change costs setup time the SMV does not include. Three in one day on
    // one line is a plan that will not happen.
    const result = checkLineDayLoad(CAPACITY, [
      load({ orderId: 'a', styleCode: 'ST-1', qty: 200 }),
      load({ orderId: 'b', styleCode: 'ST-2', qty: 200 }),
      load({ orderId: 'c', styleCode: 'ST-3', qty: 200 }),
    ])

    expect(result.violations.map((v) => v.code)).toContain('changeover_density')
  })

  it('14 · is exact — SMV is quoted to two decimals', () => {
    const result = checkLineDayLoad(CAPACITY, [load({ smv: '0.33', qty: 3 })])
    expect(result.requiredMinutes).toBe('0.99')
  })

  it('15 · refuses a negative or fractional quantity', () => {
    expect(() => checkLineDayLoad(CAPACITY, [load({ qty: -10 })])).toThrow(PlanningError)
    expect(() => checkLineDayLoad(CAPACITY, [load({ qty: 10.5 })])).toThrow(PlanningError)
  })
})

describe('answerCapacityQuery · the owner card', () => {
  const lineDays: LineDayCapacity[] = Array.from({ length: 10 }, (_, i) => ({
    ...CAPACITY,
    date: `2026-08-${String(i + 3).padStart(2, '0')}`,
  }))

  it('16 · says yes, and shows the assumptions it used', () => {
    const answer = answerCapacityQuery({
      smv: '12.5',
      qty: 8000,
      lineDays,
      existingLoad: [],
    })

    // 8000 × 12.5 = 100,000 minutes needed; 10 days × 10,800 = 108,000 earnable.
    expect(answer.feasible).toBe(true)
    expect(answer.requiredMinutes).toBe('100000.00')
    expect(answer.availableMinutes).toBe('108000.00')
    // An answer without its assumptions is a number somebody will quote back later.
    expect(answer.assumptions.efficiencyPct).toBe('60')
    expect(answer.assumptions.lineDays).toBe(10)
  })

  it('17 · says no with the shortfall, and what it would take', () => {
    const answer = answerCapacityQuery({ smv: '12.5', qty: 12000, lineDays, existingLoad: [] })

    expect(answer.feasible).toBe(false)
    // 150,000 needed vs 108,000 — 42,000 minutes short, about 4 more line-days.
    expect(answer.shortfallMinutes).toBe('42000.00')
    expect(answer.additionalLineDaysNeeded).toBe(4)
  })

  it('18 · counts what is already committed on those days', () => {
    const answer = answerCapacityQuery({
      smv: '12.5',
      qty: 6000,
      lineDays,
      existingLoad: lineDays.map((day) => ({
        lineId: day.lineId,
        date: day.date,
        loads: [{ orderId: 'other', styleCode: 'ST-9', smv: '10', qty: 700 }],
      })),
    })

    // 7,000 minutes already spoken for each day leaves 3,800 — 38,000 over ten days,
    // against 75,000 needed.
    expect(answer.feasible).toBe(false)
    expect(answer.availableMinutes).toBe('38000.00')
  })

  it('19 · refuses to answer without an SMV rather than guessing one', () => {
    // "About 12 minutes" is how a factory commits to a date it cannot make.
    expect(() =>
      answerCapacityQuery({ smv: '', qty: 1000, lineDays, existingLoad: [] }),
    ).toThrow(PlanningError)
  })

  it('20 · refuses an empty window', () => {
    expect(() =>
      answerCapacityQuery({ smv: '12.5', qty: 1000, lineDays: [], existingLoad: [] }),
    ).toThrow(/no line-days/i)
  })
})

describe('the status machines the board reads (plan 5.4)', () => {
  /*
   * They live in this file, not in `service.ts`, and the reason is a build break: the
   * planning board's buttons need the legal transitions, and a client component importing
   * the service drags the database client — and `postgres` — into the browser bundle.
   *
   * Which makes this table the SCREEN. The buttons are built from `next()`, so offering a
   * move the server refuses would make every click a coin toss between working and a 409,
   * and offering fewer than the legal ones strands a run nobody can advance.
   */
  it('offers the board exactly the moves the server accepts', () => {
    expect([...allocationMachine.next('planned')]).toEqual(['active'])
    expect([...allocationMachine.next('active')]).toEqual(['done'])
  })

  it('leaves a finished run with nothing to offer', () => {
    // No buttons at all on a done run, which is the correct empty rather than a broken one.
    expect(allocationMachine.next('done')).toEqual([])
    expect(allocationMachine.terminal).toContain('done')
  })

  it('never walks a run backwards', () => {
    // A run moved back to `planned` after the line has started on it puts work back on a
    // board that is already being cut to.
    illegal(() => allocationMachine.assert('active', 'planned'))
    illegal(() => allocationMachine.assert('done', 'active'))
  })

  it('lets a scenario be applied or discarded, once', () => {
    expect(() => scenarioMachine.assert('draft', 'applied')).not.toThrow()
    expect(() => scenarioMachine.assert('draft', 'discarded')).not.toThrow()
    // Applying twice would re-plan lines against a board that has already moved.
    illegal(() => scenarioMachine.assert('applied', 'applied'))
    illegal(() => scenarioMachine.assert('discarded', 'applied'))
  })
})

const illegal = (fn: () => void) =>
  expect(fn).toThrowError(expect.objectContaining({ status: 409, code: 'illegal_transition' }))
