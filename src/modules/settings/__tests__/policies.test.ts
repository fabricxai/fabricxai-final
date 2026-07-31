/**
 * Policy registry vectors.
 *
 * X.3 exists because twelve modules took a `Policy` argument that whoever happened to be
 * calling supplied — so two screens could judge the same thing by different numbers. These
 * assert the merge that makes one stored row authoritative:
 *
 *  1. **Defaults are complete.** A fresh factory must work before anybody configures
 *     anything, so every module's defaults have to pass its own schema.
 *  2. **An override replaces one field, not the bag.** Setting a margin floor must not blank
 *     out everything else in the same policy.
 *  3. **Invalid stored JSON fails HERE**, not inside a service. A tolerance of "abc" reaching
 *     the cutting checker is a crash on the floor; reaching this function is an error in a
 *     settings screen.
 */
import { describe, expect, it } from 'vitest'

import {
  POLICY_MODULE_IDS,
  POLICY_REGISTRY,
  resolvePolicyValue,
  SettingsError,
  validatePolicyPatch,
} from '../policies'

describe('the registry covers every module that takes a policy', () => {
  it('1 · lists every module with configurable policy', () => {
    // If a module gains a Policy interface and is not registered here, its numbers go back
    // to being whatever the call site says.
    expect(POLICY_MODULE_IDS).toEqual([
      'analytics',
      'approvals',
      'buyers',
      'commercial',
      'compliance',
      'costing',
      'cutting',
      'finance',
      'maintenance',
      'marbim',
      'planning',
      'procurement',
      'quality',
      'rfq',
      'sampling',
      'shipment',
    ])
  })

  it('2 · every default passes its own schema', () => {
    // A fresh factory works before anybody configures anything, which is only true if the
    // defaults are themselves valid.
    for (const moduleId of POLICY_MODULE_IDS) {
      const definition = POLICY_REGISTRY[moduleId]!
      expect(
        definition.schema.safeParse(definition.defaults).success,
        `${moduleId} defaults are invalid`,
      ).toBe(true)
    }
  })

  it('3 · every module resolves with no stored override at all', () => {
    for (const moduleId of POLICY_MODULE_IDS) {
      expect(() => resolvePolicyValue(moduleId, null), moduleId).not.toThrow()
    }
  })

  it('4 · every module has a human label', () => {
    for (const moduleId of POLICY_MODULE_IDS) {
      expect(POLICY_REGISTRY[moduleId]!.label.length, moduleId).toBeGreaterThan(3)
    }
  })
})

describe('resolvePolicyValue · merging an override onto the defaults', () => {
  it('5 · returns the defaults when nothing is stored', () => {
    const policy = resolvePolicyValue<{ tolerancePct: string; defaultBundleSize?: number }>(
      'cutting',
      null,
    )
    expect(policy.tolerancePct).toBe('2')
    expect(policy.defaultBundleSize).toBe(20)
  })

  it('6 · an override replaces ONE field and leaves the rest', () => {
    // Setting a tolerance must not blank out the bundle size in the same policy.
    const policy = resolvePolicyValue<{ tolerancePct: string; defaultBundleSize?: number }>(
      'cutting',
      { tolerancePct: '3.5' },
    )
    expect(policy.tolerancePct).toBe('3.5')
    expect(policy.defaultBundleSize).toBe(20)
  })

  it('7 · drops a stored key the schema no longer knows', () => {
    // A policy field that was renamed must not keep feeding a service a value under a name
    // nobody maintains.
    const policy = resolvePolicyValue<Record<string, unknown>>('cutting', {
      tolerancePct: '2',
      legacyThingy: 'nonsense',
    })
    expect(policy.legacyThingy).toBeUndefined()
  })

  it('8 · treats an explicit null as "use the default"', () => {
    const policy = resolvePolicyValue<{ tolerancePct: string }>('cutting', {
      tolerancePct: null,
    })
    expect(policy.tolerancePct).toBe('2')
  })

  it('9 · refuses invalid stored JSON rather than passing it to a service', () => {
    // A tolerance of "abc" reaching the cutting checker is a crash on the floor. Reaching
    // this function is an error in a settings screen.
    expect(() => resolvePolicyValue('cutting', { tolerancePct: 'abc' })).toThrow(SettingsError)
  })

  it('10 · names the offending field when it refuses', () => {
    let message = ''
    try {
      resolvePolicyValue('quality', { repeatDefectDays: 1 })
    } catch (error) {
      message = (error as Error).message
    }
    // "invalid" alone sends somebody reading raw JSON. Naming the field does not.
    expect(message).toContain('repeatDefectDays')
  })

  it('11 · refuses a module that has no configurable policy', () => {
    expect(() => resolvePolicyValue('store', {})).toThrow(/no configurable policy/)
  })

  it('12 · a policy with a required field cannot be stored empty', () => {
    // `cutting.tolerancePct` is required precisely because a default inside the checker
    // would be a silent allowance. Clearing it falls back to the registry default, which is
    // the only place a default is allowed to live.
    const policy = resolvePolicyValue<{ tolerancePct: string }>('cutting', {})
    expect(policy.tolerancePct).toBe('2')
  })
})

describe('validatePolicyPatch · what a settings screen submits', () => {
  it('13 · returns both the row to store and the value that results', () => {
    const result = validatePolicyPatch<{ marginFloorPct?: string }>('costing', null, {
      marginFloorPct: '12.5',
    })

    expect(result.next).toEqual({ marginFloorPct: '12.5' })
    expect(result.resolved.marginFloorPct).toBe('12.5')
  })

  it('14 · patches onto what is already stored', () => {
    const result = validatePolicyPatch<Record<string, unknown>>(
      'quality',
      { dhuAlertThreshold: '3' },
      { repeatDefectDays: 4 },
    )

    expect(result.next).toEqual({ dhuAlertThreshold: '3', repeatDefectDays: 4 })
    expect(result.resolved.dhuAlertThreshold).toBe('3')
  })

  it('15 · an explicit null clears an override back to the default', () => {
    const result = validatePolicyPatch<{ dhuAlertThreshold?: string }>(
      'quality',
      { dhuAlertThreshold: '3' },
      { dhuAlertThreshold: null },
    )

    expect(result.next.dhuAlertThreshold).toBeUndefined()
    expect(result.resolved.dhuAlertThreshold).toBe('5')
  })

  it('16 · REFUSES an unknown setting rather than dropping it', () => {
    // Silently discarding it would leave somebody believing a setting is in force. This is
    // the one place a typo has to be loud.
    expect(() =>
      validatePolicyPatch('costing', null, { marginFloorPercent: '12' }),
    ).toThrow(/no setting "marginFloorPercent"/)
  })

  it('17 · refuses a patch whose result would be invalid', () => {
    expect(() => validatePolicyPatch('planning', null, { defaultShiftMinutes: 2000 })).toThrow(
      SettingsError,
    )
  })

  it('18 · does not mutate the row it was given', () => {
    const current = { marginFloorPct: '10' }
    validatePolicyPatch('costing', current, { marginFloorPct: '15' })
    expect(current.marginFloorPct).toBe('10')
  })
})

describe('the defaults are the numbers this industry actually uses', () => {
  it('19 · plans lines at 60%, not at 100%', () => {
    // Planning against clock minutes is the single most common way a factory over-commits.
    const planning = resolvePolicyValue<{ defaultEfficiencyPct?: string }>('planning', null)
    expect(planning.defaultEfficiencyPct).toBe('60')
  })

  it('20 · caps fabric at 40 points per hundred square yards', () => {
    const quality = resolvePolicyValue<{ fabricMaxPointsPer100SqYd: string }>('quality', null)
    expect(quality.fabricMaxPointsPer100SqYd).toBe('40')
  })

  it('21 · holds BTB credits to 75% of the master LC', () => {
    const procurement = resolvePolicyValue<{ btbLimitPct?: number }>('procurement', null)
    expect(procurement.btbLimitPct).toBe(75)
  })

  it('22 · gives the quote and the sheet behind it the SAME margin floor', () => {
    // A quote approved against one floor and a sheet against another is the exact confusion
    // this module exists to remove.
    const costing = resolvePolicyValue<{ marginFloorPct?: string }>('costing', null)
    const rfq = resolvePolicyValue<{ marginFloorPct?: string }>('rfq', null)
    expect(rfq.marginFloorPct).toBe(costing.marginFloorPct)
  })

  it('23 · never forecasts cash arriving the day an invoice is raised', () => {
    const finance = resolvePolicyValue<{ defaultRealizationLagDays: number }>('finance', null)
    expect(finance.defaultRealizationLagDays).toBeGreaterThan(0)
  })
})

describe('the defaults the scheduled jobs run on', () => {
  it('compliance CAP deadlines are ordered by severity', () => {
    // `capDeadline` REFUSES a policy in which a critical finding gets longer than a major
    // one. A shipped default that tripped that check would break the corrective-action
    // flow for every company at once, and only on the day somebody opened a CAP.
    const { capDeadlineDays } = resolvePolicyValue<{
      capDeadlineDays: { critical: number; major: number; minor: number; observation: number }
    }>('compliance', null)

    expect(capDeadlineDays.critical).toBeLessThanOrEqual(capDeadlineDays.major)
    expect(capDeadlineDays.major).toBeLessThanOrEqual(capDeadlineDays.minor)
    expect(capDeadlineDays.minor).toBeLessThanOrEqual(capDeadlineDays.observation)
  })

  it('maintenance ships NO default line-minute rate', () => {
    // Deliberately absent. 9.1 refuses to price a stoppage without one and the monthly job
    // reports that it could not — a plausible default would put an invented taka figure in
    // an owner's report for every factory that never configured it.
    const policy = resolvePolicyValue<{ lineValuePerMinute?: unknown }>('maintenance', null)
    expect(policy.lineValuePerMinute).toBeUndefined()
  })

  it('analytics scorecard weights sum to one', () => {
    // `buyerScorecard` throws otherwise, and weights summing to 0.9 would scale every score
    // down by a tenth while leaving the ranking intact — which is why nobody would find it.
    const { scorecard } = resolvePolicyValue<{
      scorecard: { weights: { otd: number; dhu: number; margin: number } }
    }>('analytics', null)

    const total = scorecard.weights.otd + scorecard.weights.dhu + scorecard.weights.margin
    expect(total).toBeCloseTo(1, 9)
  })

  it('the compliance certificate ladder is the 90/60/30 the brief names', () => {
    const { expiryRungs } = resolvePolicyValue<{ expiryRungs: number[] }>('compliance', null)
    expect(expiryRungs).toEqual([90, 60, 30])
  })
})

