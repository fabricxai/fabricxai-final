/**
 * Buyer desk logic (brief 1.1 §Operations). Pure — no database, no clock.
 *
 * Three rules, each because of a specific way this goes wrong:
 *
 *  1. **Normalise before comparing.** Trigram similarity does the duplicate matching, but
 *     it only works on names the legal suffix has been taken off. "Ltd" is on every
 *     Bangladeshi company name; matching on it makes every supplier look similar to every
 *     other, and the real duplicate gets lost in the noise.
 *  2. **Terms are versioned and DATED.** An order placed in January is governed by
 *     January's terms. Reading the newest row applies an AQL level the buyer had not agreed
 *     to when the order was taken.
 *  3. **Quiet means un-contacted.** A lead somebody renamed yesterday has not been
 *     contacted; counting a record touch as contact is how a lead goes quiet for four
 *     months without anybody noticing.
 */
import { defineStateMachine } from '../core/state-machine'

export class BuyersError extends Error {
  override readonly name = 'BuyersError'
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Legal suffixes, longest first so "pvt ltd" is stripped before "ltd" would leave "pvt".
 * Not exhaustive and does not need to be — anything left over is compared as-is, which is
 * merely less effective, not wrong.
 */
const LEGAL_SUFFIXES = [
  'private limited',
  'pvt limited',
  'pvt ltd',
  'co ltd',
  'company limited',
  'limited',
  'ltd',
  'inc',
  'incorporated',
  'llc',
  'plc',
  'gmbh',
  'bv',
  'ab',
  'as',
  'sa',
  'srl',
  'spa',
  'corp',
  'corporation',
  'company',
  'group',
  'holdings',
]

/**
 * Reduce a company name to what is worth comparing.
 *
 * Ampersands and the word "and" fold together because merchandisers type them
 * interchangeably — "H&M" and "H and M" are the same buyer and must score as one.
 */
export function normalizeCompanyName(name: string): string {
  if (!name || !name.trim()) throw new BuyersError('a company name cannot be empty')

  let out = name
    .toLowerCase()
    // Before punctuation is stripped, so "&" does not simply vanish.
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // "and" is a joining word, not a distinguishing one.
  out = out.replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim()

  for (const suffix of LEGAL_SUFFIXES) {
    const bare = suffix.replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim()
    if (out === bare) break // The name IS the suffix; emptying it would match everything.
    if (out.endsWith(` ${bare}`)) {
      out = out.slice(0, -(bare.length + 1)).trim()
    }
  }

  return out
}

/**
 * The registrable host, or null.
 *
 * Null rather than a guess: a junk value coerced into a plausible domain would match
 * unrelated buyers, and a duplicate warning nobody believes is a duplicate warning
 * everybody dismisses.
 */
export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null

  let candidate = value.trim().toLowerCase()
  if (!candidate) return null

  // Merchandisers paste a contact email into the website field constantly.
  const at = candidate.lastIndexOf('@')
  if (at >= 0) candidate = candidate.slice(at + 1)

  candidate = candidate
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]!
    .replace(/\.$/, '')
    .trim()

  // A host has at least one dot and no whitespace. "to be confirmed" must not become a
  // domain.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(candidate)) return null
  return candidate
}

// ─────────────────────────────────────────────────────────────────────────────
// Terms
// ─────────────────────────────────────────────────────────────────────────────

export interface BuyerTermsVersion {
  id: string
  validFrom: string
  aqlLevel: string
  tolerancePct: string
}

/**
 * Which version of a buyer's terms governed a given date.
 *
 * Two versions starting on the same day is refused rather than resolved: which one applied
 * would be a question of row order, and it decides an AQL level and a shipping tolerance.
 *
 * Null before any version existed, rather than falling back to the earliest — a quote
 * priced before terms were agreed has no terms, and inventing an agreement is worse than
 * saying there was not one.
 */
export function termsInForceOn<T extends BuyerTermsVersion>(
  versions: readonly T[],
  onDate: string,
): T | null {
  if (!ISO_DATE.test(onDate)) throw new BuyersError(`"${onDate}" is not a date`)

  const seen = new Set<string>()
  for (const version of versions) {
    if (!ISO_DATE.test(version.validFrom)) {
      throw new BuyersError(`"${version.validFrom}" is not a date`)
    }
    if (seen.has(version.validFrom)) {
      throw new BuyersError(
        `two terms versions both start on ${version.validFrom} — which one applied is ambiguous`,
      )
    }
    seen.add(version.validFrom)
  }

  const eligible = versions.filter((version) => version.validFrom <= onDate)
  if (eligible.length === 0) return null

  // Sorted here rather than trusting the caller's ordering.
  return eligible.reduce((latest, version) =>
    version.validFrom > latest.validFrom ? version : latest,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Days since anybody actually spoke to them.
 *
 * Falls back to the creation date, not to zero: a lead nobody has ever contacted is the
 * quietest lead there is, not one with no age.
 */
export function quietDays(input: {
  lastActivityAt: string | null
  createdAt?: string
  today: string
}): number {
  const from = input.lastActivityAt ?? input.createdAt
  if (!from) {
    throw new BuyersError('a lead with no activity and no creation date cannot be aged')
  }
  if (!ISO_DATE.test(from) || !ISO_DATE.test(input.today)) {
    throw new BuyersError('quiet days needs YYYY-MM-DD dates')
  }

  return Math.round(
    (Date.parse(`${input.today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}

/**
 * new → contacted → sampling_talk → negotiation → won | lost.
 *
 * `lost` is NOT terminal. A buyer who went elsewhere on price this season is next season's
 * enquiry, and a terminal `lost` would force a duplicate lead and split the history that
 * makes the second conversation worth having.
 *
 * `won` IS terminal: the lead is a buyer now, and the pipeline has nothing more to say
 * about it.
 */
export const leadStageMachine = defineStateMachine({
  field: 'stage',
  initial: 'new',
  transitions: {
    new: ['contacted', 'lost'],
    contacted: ['sampling_talk', 'negotiation', 'lost'],
    sampling_talk: ['negotiation', 'lost'],
    negotiation: ['won', 'lost'],
    won: [],
    lost: ['contacted', 'negotiation'],
  },
})

export type LeadStage = (typeof leadStageMachine.states)[number]
