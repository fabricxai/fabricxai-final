/**
 * LC amendment and bank-submission logic (brief 2.1 §Operations). Pure — no database.
 *
 * This is where the factory finally gets paid, and every rule here exists because of a way
 * that goes wrong:
 *
 *  1. **An amendment can CREATE conflicts.** Extending a latest-shipment date is the case
 *     everyone remembers; shortening one, or pulling in an expiry, breaks orders that were
 *     fine. `applyAmendment` reports a tightening so the caller knows to re-run the
 *     conflict detector against the AMENDED terms.
 *  2. **Realization is usually short.** The bank deducts its charges before crediting, so
 *     realized ≠ invoiced is normal. Treating a short credit as an error, or as full
 *     settlement, both misstate the receivable.
 *  3. **Realization lag is a median.** One 90-day dispute would drag a mean forecast weeks
 *     out for every future shipment.
 */

import { fromMinor, toMinor } from '@/lib/quantity'
export class BankDocsError extends Error {
  override readonly name = 'BankDocsError'
}

const MONEY = /^\d+(\.\d{1,2})?$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The LC terms an amendment may touch. Currency is deliberately absent — see below. */
export interface AmendableLcTerms {
  value: string
  currency: string
  tolerancePct: string
  latestShipmentDate: string | null
  expiryDate: string | null
}

export type LcAmendmentDiff = Partial<{
  value: string
  currency: string
  tolerancePct: string
  latestShipmentDate: string | null
  expiryDate: string | null
}>

export interface AmendmentResult {
  terms: AmendableLcTerms
  changed: { field: string; from: string | null; to: string | null }[]
  /**
   * True when the amendment makes the credit HARDER to draw on — a shorter shipping
   * window, an earlier expiry, or a smaller value. The caller re-runs the conflict
   * detector either way; this says whether to expect new conflicts rather than fewer.
   */
  tightened: boolean
}

function assertMoney(value: string, what: string): string {
  if (!MONEY.test(value)) throw new BankDocsError(`"${value}" is not a ${what}`)
  return value
}

function assertDate(value: string, what: string): string {
  if (!ISO_DATE.test(value)) throw new BankDocsError(`"${value}" is not a ${what}`)
  return value
}

/**
 * Apply an amendment diff to the LC terms currently in force.
 *
 * A diff, not a replacement: only the named fields move. The currency cannot be amended —
 * a credit in another currency is a different credit, and changing it in place would
 * silently reinterpret every figure already recorded against it.
 */
export function applyAmendment(
  current: AmendableLcTerms,
  diff: LcAmendmentDiff,
): AmendmentResult {
  if (diff.currency !== undefined && diff.currency !== current.currency) {
    throw new BankDocsError(
      'an LC currency cannot be amended — a credit in another currency is a different credit',
    )
  }

  const next: AmendableLcTerms = { ...current }
  const changed: { field: string; from: string | null; to: string | null }[] = []

  if (diff.value !== undefined) {
    assertMoney(diff.value, 'money amount')
    if (diff.value !== current.value) {
      next.value = diff.value
      changed.push({ field: 'value', from: current.value, to: diff.value })
    }
  }

  if (diff.tolerancePct !== undefined && diff.tolerancePct !== current.tolerancePct) {
    next.tolerancePct = diff.tolerancePct
    changed.push({ field: 'tolerancePct', from: current.tolerancePct, to: diff.tolerancePct })
  }

  if (diff.latestShipmentDate !== undefined && diff.latestShipmentDate !== current.latestShipmentDate) {
    if (diff.latestShipmentDate !== null) assertDate(diff.latestShipmentDate, 'date')
    next.latestShipmentDate = diff.latestShipmentDate
    changed.push({
      field: 'latestShipmentDate',
      from: current.latestShipmentDate,
      to: diff.latestShipmentDate,
    })
  }

  if (diff.expiryDate !== undefined && diff.expiryDate !== current.expiryDate) {
    if (diff.expiryDate !== null) assertDate(diff.expiryDate, 'date')
    next.expiryDate = diff.expiryDate
    changed.push({ field: 'expiryDate', from: current.expiryDate, to: diff.expiryDate })
  }

  if (changed.length === 0) {
    // A no-op amendment burns a version number and makes the register lie about how many
    // times the bank amended the credit.
    throw new BankDocsError('this amendment changes nothing')
  }

  if (next.expiryDate && next.latestShipmentDate && next.expiryDate < next.latestShipmentDate) {
    // Documents are presented after shipment. An expiry before the shipping deadline is a
    // credit that cannot be drawn on — and banks do issue them by mistake.
    throw new BankDocsError(
      `expiry ${next.expiryDate} falls before the latest shipment date ${next.latestShipmentDate}`,
    )
  }

  const shorterWindow =
    next.latestShipmentDate !== null &&
    current.latestShipmentDate !== null &&
    next.latestShipmentDate < current.latestShipmentDate

  const earlierExpiry =
    next.expiryDate !== null && current.expiryDate !== null && next.expiryDate < current.expiryDate

  const smallerValue = toMinor(next.value) < toMinor(current.value)

  // Sorted so the diff reads the same way every time it is rendered.
  changed.sort((a, b) => a.field.localeCompare(b.field))

  return { terms: next, changed, tightened: shorterWindow || earlierExpiry || smallerValue }
}

// ─────────────────────────────────────────────────────────────────────────────
// Realization
// ─────────────────────────────────────────────────────────────────────────────

export interface ShortfallResult {
  shortfall: string
  shortfallPct: string
  fullyRealized: boolean
  needsExplanation: boolean
}

/**
 * What the bank kept.
 *
 * A shortfall is the NORMAL case — bank charges, courier, and any discrepancy fee come off
 * before the credit lands. An over-credit is reported as a negative rather than clamped:
 * clamping would leave the receivable permanently open by the difference.
 */
export function realizationShortfall(input: {
  invoiced: string
  realized: string
  /** Above this percentage the deduction is not bank charges and somebody must say why. */
  explainAbovePct?: string
}): ShortfallResult {
  assertMoney(input.invoiced, 'money amount')
  assertMoney(input.realized, 'money amount')

  const invoiced = toMinor(input.invoiced)
  if (invoiced === 0n) {
    throw new BankDocsError('a zero invoice cannot be realized against')
  }

  const shortfallMinor = invoiced - toMinor(input.realized)
  // Scaled by 10 so the half-up rounding decides on a digit that was computed.
  const pctMinor = (shortfallMinor * 100n * 1000n) / invoiced
  const shortfallPct = fromMinor((pctMinor + (pctMinor < 0n ? -5n : 5n)) / 10n)

  const threshold = input.explainAbovePct ? toMinor(input.explainAbovePct) : null

  return {
    shortfall: fromMinor(shortfallMinor),
    shortfallPct,
    fullyRealized: shortfallMinor <= 0n,
    needsExplanation: threshold !== null && toMinor(shortfallPct) > threshold,
  }
}

export interface DiscrepancyAgeResult {
  days: number
  escalate: boolean
}

/**
 * How long a discrepancy has been sitting (brief §Jobs: "discrepancy aging (>5d)").
 *
 * Escalates ON the threshold day, not after it. A limit that only fires on day six hands
 * the bank an extra day at the factory's expense.
 */
export function discrepancyAge(input: {
  discrepantSince: string
  today: string
  escalateAfterDays: number
}): DiscrepancyAgeResult {
  const days = dayGap(assertDate(input.discrepantSince, 'date'), assertDate(input.today, 'date'))

  if (!Number.isInteger(input.escalateAfterDays) || input.escalateAfterDays < 0) {
    throw new BankDocsError('the escalation window must be a whole number of days')
  }

  return { days, escalate: days >= input.escalateAfterDays }
}

export interface RealizationLagResult {
  /** Null when there is no history. Never zero — see below. */
  medianDays: number | null
  observations: number
}

/**
 * How long this buyer's bank actually takes to pay (brief §Jobs: "realization-lag stats per
 * buyer", feeding 11.1's receivable forecast).
 *
 * The MEDIAN, deliberately. One LC that took ninety days because of a dispute would drag a
 * mean weeks out for every future shipment, and a cash forecast built on that is worse than
 * no forecast.
 *
 * Null with no history rather than zero: zero would forecast cash arriving the day
 * documents are submitted, the most optimistic possible lie for a cash timeline to tell.
 */
export function realizationLag(
  submissions: readonly { submittedAt: string; realizedAt: string | null }[],
): RealizationLagResult {
  const lags: number[] = []

  for (const submission of submissions) {
    if (!submission.realizedAt) continue

    const days = dayGap(
      assertDate(submission.submittedAt, 'date'),
      assertDate(submission.realizedAt, 'date'),
    )
    if (days < 0) {
      throw new BankDocsError(
        `realized ${submission.realizedAt} is before submitted ${submission.submittedAt}`,
      )
    }
    lags.push(days)
  }

  if (lags.length === 0) return { medianDays: null, observations: 0 }

  lags.sort((a, b) => a - b)
  const middle = Math.floor(lags.length / 2)
  const medianDays =
    lags.length % 2 === 1
      ? lags[middle]!
      : Math.round((lags[middle - 1]! + lags[middle]!) / 2)

  return { medianDays, observations: lags.length }
}

function dayGap(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}

