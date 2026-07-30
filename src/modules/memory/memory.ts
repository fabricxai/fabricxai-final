/**
 * 1.6 Order Memory — pure logic.
 *
 * The module answers one question: what actually happened on the orders like this one. That
 * answer feeds the next quote, so every function here draws a hard line between a measurement
 * and a guess, and refuses to produce the second while looking like the first.
 *
 * Three places that line matters:
 *
 *  - A day a sewing line ran two orders has ONE efficiency number covering both. It is
 *    reported and flagged, never divided — there is no record of the split and inventing one
 *    would put a fabricated figure into the most trusted screen in merchandising.
 *  - Consumption per piece is exact decimal arithmetic on a denominator that must be
 *    positive. It becomes a line in a cost sheet; a rounding shortcut here is money.
 *  - A milestone that never got an actual date is a GAP, not a delay of zero. Closed orders
 *    have gaps, and reading one as "on time" flatters the factory's own record.
 *
 * Nothing here reads a clock, a database, or a model. `service.ts` supplies the rows.
 */

export class MemoryError extends Error {
  override readonly name = 'MemoryError'
}

/**
 * The embedding width, and therefore the `vector(1536)` column.
 *
 * Kept here rather than only in the migration because a model that returns a different width
 * fails per-row inside a background job, which is the worst place to discover a mismatch.
 * `embedStyle` checks against this before it writes.
 */
export const EMBEDDING_DIM = 1536

/** How much tech-pack prose may reach the embedding model. */
const TECH_PACK_CHAR_CAP = 4_000

// ─────────────────────────────────────────────────────────────────────────────
// Fingerprints
// ─────────────────────────────────────────────────────────────────────────────

export type StyleAttrs = Readonly<Record<string, string | number | null | undefined>>

/**
 * The text a style is embedded from.
 *
 * Deterministic by construction: keys sorted, values trimmed and lower-cased, empties
 * dropped. Attributes arrive out of a jsonb column whose key order Postgres does not
 * promise, and if the text moved with it, re-embedding a style nobody had touched would
 * shift it in the similarity index for no reason anybody could explain.
 *
 * The tech-pack text is capped. It is the least structured and least reliable part of the
 * input, and an unbounded one would let a forty-page document decide a match that the
 * construction and GSM should have decided.
 */
export function fingerprintText(input: {
  styleCode: string
  attrs: StyleAttrs
  techPackText?: string | null
}): string {
  const parts: string[] = []

  const styleCode = input.styleCode.trim().toLowerCase()
  if (styleCode) parts.push(`stylecode=${styleCode}`)

  for (const key of Object.keys(input.attrs).sort()) {
    const raw = input.attrs[key]
    if (raw === null || raw === undefined) continue

    const value = String(raw).trim().replace(/\s+/g, ' ').toLowerCase()
    if (!value) continue

    parts.push(`${key.trim().toLowerCase()}=${value}`)
  }

  const attributeText = parts.join('\n')

  const prose = (input.techPackText ?? '').replace(/\s+/g, ' ').trim().slice(0, TECH_PACK_CHAR_CAP)

  if (!attributeText && !prose) {
    // A vector embedded from an empty string lands somewhere arbitrary and then matches
    // whatever it happens to be near, with a confident percentage beside it. No fingerprint
    // is a better answer than a fingerprint of nothing.
    throw new MemoryError('a style fingerprint needs a style code or at least one attribute')
  }

  return prose ? `${attributeText}\n\n${prose}` : attributeText
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cosine DISTANCE (what pgvector's `<=>` returns, 0..2) as the match percentage a
 * merchandiser reads.
 *
 * Clamped at zero. Distances above 1 mean the vectors point away from each other, and
 * "-40% similar" is not a thing to put next to a past order on a screen; the useful
 * statement is that it is not a match at all.
 */
export function matchPercent(cosineDistance: number): string {
  if (!Number.isFinite(cosineDistance) || cosineDistance < 0 || cosineDistance > 2) {
    throw new MemoryError(
      `cosine distance must be a finite number in [0, 2], got ${String(cosineDistance)}`,
    )
  }

  const similarity = 1 - cosineDistance
  return (Math.max(0, similarity) * 100).toFixed(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// The efficiency curve
// ─────────────────────────────────────────────────────────────────────────────

export interface EfficiencyRow {
  lineId: string
  forDate: string
  efficiencyPct: string
}

export interface DayEfficiency {
  date: string
  lineId: string
  efficiencyPct: string
  /**
   * The line ran another order the same day. The percentage covers both and cannot be
   * attributed to this one.
   */
  sharedWithOtherOrders: boolean
}

/**
 * The day-by-day efficiency an order was made at.
 *
 * `ordersOnLineDate` maps `lineId|date` to how many distinct orders that line ran that day.
 * Anything above one gets flagged rather than apportioned: the factory records output per
 * line per day, not per order per line per day, so the split simply is not in the data. A
 * plausible division would be indistinguishable from a measurement on the screen that uses
 * it, which is the whole failure this module exists to avoid.
 */
export function efficiencyCurve(input: {
  rows: readonly EfficiencyRow[]
  ordersOnLineDate: Readonly<Record<string, number>>
}): DayEfficiency[] {
  const seen = new Set<string>()

  const curve = input.rows.map((row) => {
    const key = `${row.lineId}|${row.forDate}`
    if (seen.has(key)) {
      // `efficiency_daily` is unique on (line, date). Two rows means 6.1 wrote something it
      // should not have, and quietly keeping one of them hides it.
      throw new MemoryError(`two efficiency rows for line ${row.lineId} on ${row.forDate}`)
    }
    seen.add(key)

    return {
      date: row.forDate,
      lineId: row.lineId,
      efficiencyPct: row.efficiencyPct,
      sharedWithOtherOrders: (input.ordersOnLineDate[key] ?? 1) > 1,
    }
  })

  // Sorted so two compilations of the same order produce the same curve.
  return curve.sort((a, b) => a.date.localeCompare(b.date) || a.lineId.localeCompare(b.lineId))
}

// ─────────────────────────────────────────────────────────────────────────────
// Defects
// ─────────────────────────────────────────────────────────────────────────────

export interface DefectTally {
  code: string
  count: number
  /** Share of all defects found on this order, one decimal. */
  pctOfDefects: string
}

/** What went wrong most often, ranked, with a deterministic tie-break. */
export function topDefects(
  checks: readonly { defects: readonly { code: string; count: number }[] }[],
  k = 5,
): DefectTally[] {
  const tally = new Map<string, number>()

  for (const check of checks) {
    for (const defect of check.defects) {
      // A zero or negative count is not a defect. Letting one through would leave a row that
      // reads as a problem and would drag every other percentage down by its presence.
      if (!Number.isFinite(defect.count) || defect.count <= 0) continue
      tally.set(defect.code, (tally.get(defect.code) ?? 0) + defect.count)
    }
  }

  const found = [...tally.values()].reduce((running, count) => running + count, 0)
  if (found === 0) return []

  return [...tally.entries()]
    .map(([code, count]) => ({
      code,
      count,
      pctOfDefects: ((count / found) * 100).toFixed(1),
    }))
    // Count descending, then code — without the second key the order comes from however the
    // rows arrived and two compilations of one order disagree about its top defect.
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, k)
}

// ─────────────────────────────────────────────────────────────────────────────
// Delays
// ─────────────────────────────────────────────────────────────────────────────

export interface DelayEvent {
  milestone: string
  /** Positive when late, negative when early. */
  days: number
  direction: 'late' | 'early'
}

const MS_PER_DAY = 86_400_000

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new MemoryError(`not a date: ${from} → ${to}`)
  }
  return Math.round((end - start) / MS_PER_DAY)
}

/**
 * Which milestones moved, and by how much.
 *
 * A milestone with no actual date is left out entirely. On a closed order that is a gap in
 * the record — somebody never ticked it — and reporting it as a zero-day delay would turn
 * missing paperwork into evidence the factory hit its dates.
 */
export function delayEvents(
  milestones: readonly { name: string; plannedDate: string; actualDate: string | null }[],
): DelayEvent[] {
  return milestones
    .filter((milestone) => milestone.actualDate !== null)
    .map((milestone) => ({
      milestone: milestone.name,
      days: daysBetween(milestone.plannedDate, milestone.actualDate!),
    }))
    .filter((event) => event.days !== 0)
    .map((event) => ({ ...event, direction: event.days > 0 ? ('late' as const) : ('early' as const) }))
    // Worst first: the fourteen-day fabric delay is the reason anybody opens this.
    .sort((a, b) => Math.abs(b.days) - Math.abs(a.days) || a.milestone.localeCompare(b.milestone))
}

// ─────────────────────────────────────────────────────────────────────────────
// Consumption
// ─────────────────────────────────────────────────────────────────────────────

/** Consumption is carried to four decimals — two loses real money over 100,000 pieces. */
const CONSUMPTION_SCALE = 4
const CONSUMPTION_UNIT = 10n ** BigInt(CONSUMPTION_SCALE)

/**
 * What one garment actually consumed: total issued ÷ pieces produced.
 *
 * Exact throughout — the quantity is scaled to an integer, divided, and rounded once at the
 * end (CLAUDE.md rule 4). This figure goes into the next cost sheet as the consumption a
 * quote is built on, so a float's last bits are a real, if small, price error repeated
 * across every future order for the style.
 */
export function perPieceConsumption(issuedQty: string, piecesProduced: number): string {
  if (!Number.isInteger(piecesProduced) || piecesProduced <= 0) {
    // Consumption per piece is only meaningful if pieces were made. A zero denominator
    // defaulted to anything at all puts a fabricated figure into a cost sheet.
    throw new MemoryError(`pieces produced must be a positive integer, got ${piecesProduced}`)
  }
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(issuedQty)) {
    throw new MemoryError(`issued quantity must be a non-negative decimal, got "${issuedQty}"`)
  }

  const [whole = '0', fraction = ''] = issuedQty.split('.')
  const scaled =
    BigInt(whole) * CONSUMPTION_UNIT * 1000n +
    BigInt((fraction + '0000000').slice(0, CONSUMPTION_SCALE + 3))

  const divisor = BigInt(piecesProduced)
  // Round half-up once, on the scaled integer, after the division.
  const rounded = (scaled / divisor + 500n) / 1000n

  const unit = rounded / CONSUMPTION_UNIT
  const rest = rounded % CONSUMPTION_UNIT
  return `${unit}.${rest.toString().padStart(CONSUMPTION_SCALE, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Immutability
// ─────────────────────────────────────────────────────────────────────────────

/** The one field a person may still change after the outcome is compiled. */
const EDITABLE_OUTCOME_FIELDS = new Set(['merchandiserNote'])

/** The compiled outcome is a record. Seven days to add the note, then it is closed. */
export const NOTE_EDIT_WINDOW_DAYS = 7

export function noteWindowOpen(
  compiledAt: Date,
  now: Date,
  days = NOTE_EDIT_WINDOW_DAYS,
): boolean {
  return now.getTime() - compiledAt.getTime() <= days * MS_PER_DAY
}

/**
 * Refuse an edit to anything but the note.
 *
 * The outcome is what the next quote gets built on, and a margin somebody tidied up after
 * the fact is worse than having no memory at all — it is a wrong number with the authority
 * of a measurement. The note is deliberately the exception: it is the merchandiser's own
 * account, marked as such, and the reason the close-out prompt exists.
 */
export function assertOutcomePatch(patch: Readonly<Record<string, unknown>>): void {
  const forbidden = Object.keys(patch).filter((field) => !EDITABLE_OUTCOME_FIELDS.has(field))
  if (forbidden.length > 0) {
    throw new MemoryError(
      `a compiled outcome is immutable except for the note — refused: ${forbidden.join(', ')}`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeding
// ─────────────────────────────────────────────────────────────────────────────

/** Pieces at which a measured consumption figure is as good as this module can make it. */
const FULL_RUN_PIECES = 5_000

/**
 * How much to trust one line of a seeded bill of materials.
 *
 * `pending_changes` wants per-field confidence and X.2 forbids a constant, and here that is
 * not a formality — the numbers genuinely differ in quality:
 *
 *  - a `planned` line was NOT measured on that order at all. It is the old estimate, carried
 *    across so the BOM keeps its shape, and it deserves the lowest score in the inbox.
 *  - an `actual` line measured over 12,000 pieces has averaged out the end bits, the marker
 *    variation and the re-cuts. The same figure over 400 pieces has not, and a reviewer
 *    should look at it.
 *
 * Monotone in pieces, so more evidence never scores lower.
 */
export function seededLineConfidence(input: {
  basis: 'planned' | 'actual'
  piecesProduced: number
}): number {
  if (!Number.isFinite(input.piecesProduced) || input.piecesProduced < 0) {
    throw new MemoryError(`pieces produced must be a non-negative number`)
  }
  if (input.basis === 'planned') return 0.3

  const evidence = Math.min(1, input.piecesProduced / FULL_RUN_PIECES)
  return Number((0.6 + 0.35 * evidence).toFixed(2))
}

