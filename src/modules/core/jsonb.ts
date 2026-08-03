/**
 * Reading `jsonb` columns at the query boundary.
 *
 * Drizzle types a `jsonb` column as whatever `$type<…>()` claims, and nothing
 * checks that claim at runtime. So a column whose shape drifted — because it
 * was written by an older service version, a migration, a seed, or a hand-run
 * UPDATE — arrives typed and wrong, and the first thing that notices is a
 * screen rendering `[object Object]` or, worse, silently rendering nothing.
 *
 * The nothing case is the dangerous one. Three real examples from this codebase:
 *
 *   - `tna_milestones.depends_on` holds BOTH `'trims_in_house'` and
 *     `{name, gapDays}`. A reader that kept only strings dropped every
 *     dependency carrying a deliberate gap, which are the important ones.
 *   - `order_outcomes.actual_consumption_pc` reads like a scalar and is an
 *     array of per-item lines.
 *   - `pending_changes.field_confidence` is `{}` for human drafts, which is an
 *     absence and must never be read as a confidence of zero.
 *
 * So the rule here is: parse at the boundary, and NEVER drop silently. A row
 * that will not parse is counted and reported, because "no dependencies" and
 * "three dependencies I could not read" are different facts and a screen that
 * renders them identically is lying.
 */
import type { ZodType } from 'zod'

/** Entries that parsed, plus an honest count of the ones that did not. */
export interface JsonbRead<T> {
  items: T[]
  /** How many entries failed to parse. Non-zero means the screen should say so. */
  unreadable: number
}

/** Warn once per column, not once per row — a bad backfill would drown the log. */
const warned = new Set<string>()

function warnOnce(where: string, detail: string): void {
  if (warned.has(where)) return
  warned.add(where)
  console.warn(`[jsonb] ${where}: ${detail}`)
}

/**
 * Parse a jsonb ARRAY column.
 *
 * Each entry is parsed independently, so one malformed row does not discard the
 * rest — a milestone with a corrupt dependency should still show its other
 * dependencies, and the count tells the screen that something is missing.
 */
export function readJsonbArray<T>(
  schema: ZodType<T>,
  raw: unknown,
  where: string,
): JsonbRead<T> {
  if (raw === null || raw === undefined) return { items: [], unreadable: 0 }

  if (!Array.isArray(raw)) {
    warnOnce(where, `expected an array, got ${typeof raw}`)
    return { items: [], unreadable: 1 }
  }

  const items: T[] = []
  let unreadable = 0

  for (const entry of raw) {
    const parsed = schema.safeParse(entry)
    if (parsed.success) {
      items.push(parsed.data)
    } else {
      unreadable += 1
      warnOnce(where, parsed.error.issues[0]?.message ?? 'entry did not match its schema')
    }
  }

  return { items, unreadable }
}

/**
 * Parse a jsonb OBJECT column.
 *
 * Returns null rather than a fabricated empty object, so a caller cannot
 * mistake "the column would not parse" for "the column is empty". Those mean
 * different things everywhere it matters — an empty `field_confidence` means a
 * human wrote the draft, and an unparseable one means we do not know who did.
 */
export function readJsonbObject<T>(schema: ZodType<T>, raw: unknown, where: string): T | null {
  if (raw === null || raw === undefined) return null

  const parsed = schema.safeParse(raw)
  if (parsed.success) return parsed.data

  warnOnce(where, parsed.error.issues[0]?.message ?? 'value did not match its schema')
  return null
}
