/**
 * LC amendment and bank-submission vectors — written before the implementation.
 *
 * This is where the factory finally gets paid, and the failure modes are all about money
 * arriving late or not at all:
 *
 *  1. **An amendment can CREATE conflicts, not just resolve them.** Everyone remembers that
 *     extending a latest-shipment date fixes a problem. Shortening one, or pulling in an
 *     expiry, breaks orders that were fine — and the detector has to be re-run against the
 *     amended terms, not the original ones.
 *  2. **Realization is usually SHORT.** The bank deducts its charges and any discrepancy
 *     fee before crediting, so realized ≠ invoiced is the normal case. Treating a short
 *     credit as an error, or as full settlement, both misstate the receivable.
 *  3. **Realization lag is a MEDIAN, not a mean.** One LC that took 90 days because of a
 *     dispute would drag a mean forecast weeks out for every future shipment.
 */
import { describe, expect, it } from 'vitest'

import {
  applyAmendment,
  BankDocsError,
  discrepancyAge,
  realizationLag,
  realizationShortfall,
  type AmendableLcTerms,
} from '../bank-docs'

const TERMS: AmendableLcTerms = {
  value: '100000.00',
  currency: 'USD',
  tolerancePct: '5',
  latestShipmentDate: '2026-09-30',
  expiryDate: '2026-10-15',
}

describe('applyAmendment · versioned diffs against the LC in force', () => {
  it('1 · applies only the fields the amendment names', () => {
    const result = applyAmendment(TERMS, { latestShipmentDate: '2026-10-10' })

    expect(result.terms.latestShipmentDate).toBe('2026-10-10')
    // Everything else is untouched — an amendment is a diff, not a replacement.
    expect(result.terms.value).toBe('100000.00')
    expect(result.terms.expiryDate).toBe('2026-10-15')
  })

  it('2 · records what actually changed, before and after', () => {
    const result = applyAmendment(TERMS, { value: '120000.00', tolerancePct: '10' })

    expect(result.changed).toEqual([
      { field: 'tolerancePct', from: '5', to: '10' },
      { field: 'value', from: '100000.00', to: '120000.00' },
    ])
  })

  it('3 · refuses an amendment that changes nothing', () => {
    // A no-op amendment burns a version number and makes the register lie about how many
    // times the bank amended the credit.
    expect(() => applyAmendment(TERMS, { value: '100000.00' })).toThrow(BankDocsError)
    expect(() => applyAmendment(TERMS, {})).toThrow(BankDocsError)
  })

  it('4 · refuses to amend the currency', () => {
    // A credit in another currency is a different credit. Amending the currency in place
    // would silently reinterpret every figure already recorded against it.
    expect(() => applyAmendment(TERMS, { currency: 'EUR' })).toThrow(/currency/i)
  })

  it('5 · refuses an expiry that falls before the latest shipment date', () => {
    // Documents are presented after shipment. An expiry before the shipping deadline is a
    // credit that cannot be drawn on, and banks do issue them by mistake.
    expect(() => applyAmendment(TERMS, { expiryDate: '2026-09-01' })).toThrow(/expiry/i)
  })

  it('6 · allows shortening a latest-shipment date, and says it is a tightening', () => {
    // Banks do this at a buyer's request. It must be accepted — the amendment is real —
    // but flagged, because orders that were fine yesterday are now late.
    const result = applyAmendment(TERMS, { latestShipmentDate: '2026-08-15' })

    expect(result.terms.latestShipmentDate).toBe('2026-08-15')
    expect(result.tightened).toBe(true)
  })

  it('7 · an extension is not a tightening', () => {
    expect(applyAmendment(TERMS, { latestShipmentDate: '2026-10-10' }).tightened).toBe(false)
  })

  it('7b · a real extension moves the expiry with the shipping date', () => {
    // A bank extending the shipping window extends the presentation window too — the two
    // move together, and amending only the shipping date would push it past the expiry.
    // (That is exactly what vector 5 refuses, so this is the shape a real amendment takes.)
    const result = applyAmendment(TERMS, {
      latestShipmentDate: '2026-11-30',
      expiryDate: '2026-12-15',
    })

    expect(result.tightened).toBe(false)
    expect(result.changed.map((c) => c.field)).toEqual(['expiryDate', 'latestShipmentDate'])
  })

  it('8 · reducing the value is a tightening too', () => {
    // A reduced credit can put already-shipped quantities outside what the bank will pay.
    expect(applyAmendment(TERMS, { value: '80000.00' }).tightened).toBe(true)
  })
})

describe('realizationShortfall · the bank almost never credits the full invoice', () => {
  it('9 · reports the deduction, not an error', () => {
    // $50,000 invoiced, $49,250 credited: $750 of bank charges. Normal.
    const result = realizationShortfall({ invoiced: '50000.00', realized: '49250.00' })

    expect(result.shortfall).toBe('750.00')
    expect(result.shortfallPct).toBe('1.50')
    expect(result.fullyRealized).toBe(false)
  })

  it('10 · an exact credit is fully realized', () => {
    const result = realizationShortfall({ invoiced: '50000.00', realized: '50000.00' })
    expect(result.fullyRealized).toBe(true)
    expect(result.shortfall).toBe('0.00')
  })

  it('11 · an OVER-credit is reported as negative, not clamped to zero', () => {
    // It happens — interest on a delayed payment, or a correction of an earlier deduction.
    // Clamping would leave the receivable permanently open by the difference.
    const result = realizationShortfall({ invoiced: '50000.00', realized: '50100.00' })
    expect(result.shortfall).toBe('-100.00')
  })

  it('12 · flags a shortfall past the threshold as needing an explanation', () => {
    // A 12% deduction is not bank charges; something was disputed or discounted, and
    // nobody should be able to close the receivable without saying what.
    const result = realizationShortfall({
      invoiced: '50000.00',
      realized: '44000.00',
      explainAbovePct: '5',
    })

    expect(result.needsExplanation).toBe(true)
    expect(result.shortfallPct).toBe('12.00')
  })

  it('13 · a small deduction needs no explanation', () => {
    const result = realizationShortfall({
      invoiced: '50000.00',
      realized: '49250.00',
      explainAbovePct: '5',
    })
    expect(result.needsExplanation).toBe(false)
  })

  it('14 · refuses a zero invoice', () => {
    expect(() => realizationShortfall({ invoiced: '0.00', realized: '0.00' })).toThrow(
      BankDocsError,
    )
  })
})

describe('discrepancyAge · the escalation clock', () => {
  it('15 · counts days since the bank raised the discrepancy', () => {
    const result = discrepancyAge({
      discrepantSince: '2026-07-22',
      today: '2026-07-30',
      escalateAfterDays: 5,
    })

    expect(result.days).toBe(8)
    expect(result.escalate).toBe(true)
  })

  it('16 · stays quiet inside the window', () => {
    const result = discrepancyAge({
      discrepantSince: '2026-07-28',
      today: '2026-07-30',
      escalateAfterDays: 5,
    })
    expect(result.escalate).toBe(false)
  })

  it('17 · escalates exactly ON the threshold day', () => {
    // Five days is the limit, and a limit that only fires on day six gives the bank an
    // extra day at the factory's expense.
    const result = discrepancyAge({
      discrepantSince: '2026-07-25',
      today: '2026-07-30',
      escalateAfterDays: 5,
    })
    expect(result.days).toBe(5)
    expect(result.escalate).toBe(true)
  })
})

describe('realizationLag · a median, not a mean', () => {
  it('18 · is the median of past lags', () => {
    // 10, 12, 14, 16, 90 → median 14. The mean is 28.4, which would forecast every future
    // shipment two weeks late on the strength of one dispute.
    const result = realizationLag([
      { submittedAt: '2026-01-01', realizedAt: '2026-01-11' },
      { submittedAt: '2026-02-01', realizedAt: '2026-02-13' },
      { submittedAt: '2026-03-01', realizedAt: '2026-03-15' },
      { submittedAt: '2026-04-01', realizedAt: '2026-04-17' },
      { submittedAt: '2026-05-01', realizedAt: '2026-07-30' },
    ])

    expect(result.medianDays).toBe(14)
    expect(result.observations).toBe(5)
  })

  it('19 · averages the middle two on an even count', () => {
    const result = realizationLag([
      { submittedAt: '2026-01-01', realizedAt: '2026-01-11' },
      { submittedAt: '2026-02-01', realizedAt: '2026-02-13' },
    ])
    expect(result.medianDays).toBe(11)
  })

  it('20 · returns null for a buyer with no realizations, not zero', () => {
    // Zero days would forecast cash arriving the day documents are submitted, which is the
    // most optimistic possible lie for a cash timeline to tell.
    const result = realizationLag([])
    expect(result.medianDays).toBeNull()
    expect(result.observations).toBe(0)
  })

  it('21 · ignores a submission that has not realized yet', () => {
    const result = realizationLag([
      { submittedAt: '2026-01-01', realizedAt: '2026-01-11' },
      { submittedAt: '2026-06-01', realizedAt: null },
    ])
    expect(result.observations).toBe(1)
    expect(result.medianDays).toBe(10)
  })

  it('22 · refuses a realization dated before its submission', () => {
    expect(() =>
      realizationLag([{ submittedAt: '2026-02-01', realizedAt: '2026-01-01' }]),
    ).toThrow(BankDocsError)
  })
})
