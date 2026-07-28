/**
 * TNA test vectors — written BEFORE the implementation (PLAYBOOK §3, flagship addenda).
 *
 * The TNA engine decides when a factory has to start cutting so a vessel is not missed.
 * Every number here is a date somebody schedules real work against, so the engine is a
 * pure function over plain data: no database, no clock, no timezone. Dates are calendar
 * dates (`YYYY-MM-DD`) because a milestone is a day, not an instant — modelling them as
 * timestamps is how a shipment silently moves by one day across a timezone boundary and
 * breaches an LC's latest-shipment clause.
 *
 * Calendar days, not working days. A Bangladeshi holiday calendar (two Eids on a lunar
 * calendar, national days, and factory-specific closures) is real and belongs here
 * eventually — but inventing one now would bake in wrong dates that look authoritative.
 * Offsets come from the template the factory already uses, which absorbs their weekends.
 */
import { describe, expect, it } from 'vitest'

import {
  generateSchedule,
  previewRipple,
  TnaError,
  type ScheduledMilestone,
  type TnaTemplate,
} from '../tna'

/** A realistic knit-top calendar: 90 days of lead time, ex-factory at offset 0. */
const TEMPLATE: TnaTemplate = {
  productType: 'knit-top',
  milestones: [
    { name: 'yarn_booking', offsetDaysBeforeExFactory: 90, dependsOn: [], critical: true },
    { name: 'fabric_in_house', offsetDaysBeforeExFactory: 60, dependsOn: ['yarn_booking'], critical: true },
    { name: 'trims_in_house', offsetDaysBeforeExFactory: 50, dependsOn: [], critical: false },
    { name: 'pp_sample_approved', offsetDaysBeforeExFactory: 48, dependsOn: ['fabric_in_house'], critical: true },
    {
      name: 'cutting_start',
      offsetDaysBeforeExFactory: 45,
      // PP approval carries its template spacing (3 days of paperwork before cutting).
      // Trims are different: they only need to BE THERE when cutting starts, so that edge
      // declares zero required lead time — five days of real, absorbing slack.
      dependsOn: ['pp_sample_approved', { name: 'trims_in_house', gapDays: 0 }],
      critical: true,
    },
    { name: 'sewing_start', offsetDaysBeforeExFactory: 40, dependsOn: ['cutting_start'], critical: true },
    { name: 'sewing_end', offsetDaysBeforeExFactory: 12, dependsOn: ['sewing_start'], critical: true },
    { name: 'finishing_end', offsetDaysBeforeExFactory: 7, dependsOn: ['sewing_end'], critical: true },
    { name: 'final_inspection', offsetDaysBeforeExFactory: 4, dependsOn: ['finishing_end'], critical: true },
    { name: 'ex_factory', offsetDaysBeforeExFactory: 0, dependsOn: ['final_inspection'], critical: true },
  ],
}

const EX_FACTORY = '2026-06-30'

const planned = (schedule: readonly ScheduledMilestone[], name: string): string => {
  const found = schedule.find((m) => m.name === name)
  if (!found) throw new Error(`no milestone "${name}" in schedule`)
  return found.plannedDate
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward scheduling
// ─────────────────────────────────────────────────────────────────────────────

describe('generateSchedule · backward scheduling', () => {
  it('1 · places every milestone its offset before ex-factory', () => {
    const schedule = generateSchedule({ exFactoryDate: EX_FACTORY, template: TEMPLATE })

    expect(planned(schedule, 'ex_factory')).toBe('2026-06-30')
    expect(planned(schedule, 'final_inspection')).toBe('2026-06-26') // −4
    expect(planned(schedule, 'sewing_end')).toBe('2026-06-18') // −12
    expect(planned(schedule, 'cutting_start')).toBe('2026-05-16') // −45
    expect(planned(schedule, 'yarn_booking')).toBe('2026-04-01') // −90
  })

  it('2 · crosses a month and a leap-year February correctly', () => {
    const schedule = generateSchedule({ exFactoryDate: '2028-03-05', template: TEMPLATE })
    // 2028 is a leap year: 5 Mar − 45 days lands in January via a 29-day February.
    expect(planned(schedule, 'cutting_start')).toBe('2028-01-20')
  })

  it('3 · pulls a dependency earlier when the template offsets contradict it', () => {
    // PP approval is declared AFTER cutting starts — impossible, cutting cannot begin
    // before the buyer approves the pre-production sample. The dependency wins and PP
    // moves earlier; the template is not silently trusted.
    const contradictory: TnaTemplate = {
      productType: 'contradictory',
      milestones: [
        { name: 'pp_sample_approved', offsetDaysBeforeExFactory: 40, dependsOn: [], critical: true },
        { name: 'cutting_start', offsetDaysBeforeExFactory: 45, dependsOn: ['pp_sample_approved'], critical: true },
        { name: 'ex_factory', offsetDaysBeforeExFactory: 0, dependsOn: ['cutting_start'], critical: true },
      ],
    }

    const schedule = generateSchedule({ exFactoryDate: EX_FACTORY, template: contradictory })

    expect(planned(schedule, 'cutting_start')).toBe('2026-05-16') // −45, unchanged
    // Pulled back from −40 to −45 so it precedes the thing that depends on it.
    expect(planned(schedule, 'pp_sample_approved')).toBe('2026-05-16')
  })

  it('4 · honours a minimum gap between a milestone and its dependent', () => {
    const gapped: TnaTemplate = {
      productType: 'gapped',
      milestones: [
        { name: 'fabric_in_house', offsetDaysBeforeExFactory: 46, dependsOn: [], critical: true },
        {
          name: 'cutting_start',
          offsetDaysBeforeExFactory: 45,
          // Fabric needs three days to relax before it can be cut, but the template only
          // spaced them one day apart. The stated gap wins and fabric is pulled earlier.
          dependsOn: [{ name: 'fabric_in_house', gapDays: 3 }],
          critical: true,
        },
      ],
    }

    const schedule = generateSchedule({ exFactoryDate: EX_FACTORY, template: gapped })
    expect(planned(schedule, 'cutting_start')).toBe('2026-05-16') // −45
    expect(planned(schedule, 'fabric_in_house')).toBe('2026-05-13') // −48, three days clear
  })

  it('5 · refuses a dependency cycle instead of looping forever', () => {
    const cyclic: TnaTemplate = {
      productType: 'cyclic',
      milestones: [
        { name: 'a', offsetDaysBeforeExFactory: 10, dependsOn: ['c'], critical: true },
        { name: 'b', offsetDaysBeforeExFactory: 8, dependsOn: ['a'], critical: true },
        { name: 'c', offsetDaysBeforeExFactory: 6, dependsOn: ['b'], critical: true },
      ],
    }

    expect(() => generateSchedule({ exFactoryDate: EX_FACTORY, template: cyclic })).toThrow(TnaError)
    expect(() => generateSchedule({ exFactoryDate: EX_FACTORY, template: cyclic })).toThrow(/cycle/i)
  })

  it('6 · refuses a dependency on a milestone that does not exist', () => {
    const dangling: TnaTemplate = {
      productType: 'dangling',
      milestones: [
        { name: 'cutting_start', offsetDaysBeforeExFactory: 45, dependsOn: ['sample_approved'], critical: true },
      ],
    }

    expect(() => generateSchedule({ exFactoryDate: EX_FACTORY, template: dangling })).toThrow(
      /unknown milestone "sample_approved"/i,
    )
  })

  it('7 · refuses a malformed ex-factory date rather than producing NaN dates', () => {
    expect(() => generateSchedule({ exFactoryDate: '30-06-2026', template: TEMPLATE })).toThrow(
      TnaError,
    )
    expect(() => generateSchedule({ exFactoryDate: '2026-02-30', template: TEMPLATE })).toThrow(
      TnaError,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Ripple
// ─────────────────────────────────────────────────────────────────────────────

describe('previewRipple · what a slip actually costs', () => {
  const base = () => generateSchedule({ exFactoryDate: EX_FACTORY, template: TEMPLATE })

  it('8 · shifts every downstream milestone by the slip', () => {
    // Fabric lands six days late. Everything after it moves six days.
    const ripple = previewRipple({
      schedule: base(),
      milestone: 'fabric_in_house',
      actualDate: '2026-05-07', // planned 2026-05-01, six days late
    })

    const moved = new Map(ripple.changes.map((c) => [c.name, c]))

    expect(moved.get('pp_sample_approved')?.toDate).toBe('2026-05-19') // was −48
    expect(moved.get('cutting_start')?.toDate).toBe('2026-05-22') // was −45
    expect(moved.get('ex_factory')?.toDate).toBe('2026-07-06')
    expect(moved.get('cutting_start')?.slipDays).toBe(6)
  })

  it('9 · reports the ex-factory impact, which is the number anyone actually asks for', () => {
    const ripple = previewRipple({
      schedule: base(),
      milestone: 'fabric_in_house',
      actualDate: '2026-05-07',
    })

    expect(ripple.exFactorySlipDays).toBe(6)
    expect(ripple.newExFactoryDate).toBe('2026-07-06')
    expect(ripple.affectsCriticalPath).toBe(true)
  })

  it('10 · leaves milestones that do not depend on the slipped one alone', () => {
    const ripple = previewRipple({
      schedule: base(),
      milestone: 'fabric_in_house',
      actualDate: '2026-05-07',
    })

    // Trims are booked independently — a fabric delay does not move them.
    expect(ripple.changes.map((c) => c.name)).not.toContain('trims_in_house')
    expect(ripple.changes.map((c) => c.name)).not.toContain('yarn_booking')
  })

  it('11 · a non-critical slip that has slack does not move ex-factory', () => {
    // The trims → cutting edge declares gapDays: 0, so the five days of template spacing
    // are real slack. A three-day trims delay is absorbed and nothing downstream moves.
    const ripple = previewRipple({
      schedule: base(),
      milestone: 'trims_in_house',
      actualDate: '2026-05-14', // planned 2026-05-11, three days late — still inside slack
    })

    expect(ripple.exFactorySlipDays).toBe(0)
    expect(ripple.newExFactoryDate).toBeNull()
    expect(ripple.affectsCriticalPath).toBe(false)
    expect(ripple.changes).toHaveLength(0)
  })

  it('12 · finishing early does NOT pull the rest of the calendar forward', () => {
    // A domain judgement, not an oversight: fabric arriving early does not mean the line
    // is free, the trims have landed, or the buyer has approved the sample. Pulling
    // dependents forward automatically would promise capacity the factory has not got.
    const ripple = previewRipple({
      schedule: base(),
      milestone: 'fabric_in_house',
      actualDate: '2026-04-25', // six days EARLY
    })

    expect(ripple.changes).toHaveLength(0)
    expect(ripple.exFactorySlipDays).toBe(0)
  })

  it('13 · never moves a milestone that has already happened', () => {
    const schedule = base().map((m) =>
      m.name === 'trims_in_house' ? { ...m, actualDate: '2026-05-11' } : m,
    )

    const ripple = previewRipple({
      schedule,
      milestone: 'fabric_in_house',
      actualDate: '2026-05-07',
    })

    // Trims already happened. A recomputation must not rewrite recorded history.
    expect(ripple.changes.map((c) => c.name)).not.toContain('trims_in_house')
  })

  it('14 · is pure — the caller’s schedule is not mutated', () => {
    const schedule = base()
    const snapshot = JSON.stringify(schedule)

    previewRipple({ schedule, milestone: 'fabric_in_house', actualDate: '2026-05-07' })

    // The UI shows a ripple BEFORE the user confirms it. If preview mutated, the
    // "cancel" button would be a lie.
    expect(JSON.stringify(schedule)).toBe(snapshot)
  })

  it('15 · refuses to actualize a milestone that is not in the schedule', () => {
    expect(() =>
      previewRipple({ schedule: base(), milestone: 'nope', actualDate: '2026-05-07' }),
    ).toThrow(/unknown milestone/i)
  })
})
