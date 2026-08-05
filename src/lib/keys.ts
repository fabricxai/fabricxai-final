/**
 * Composite keys for in-memory Maps and Sets.
 *
 * Grouping by two fields at once — (colour, size), (defect code, operation) — needs the
 * pair as one string, and needs a separator no value can contain. Three modules each chose
 * a literal NUL byte, which worked and cost more than it looked:
 *
 *  - **A source file with a NUL in it is a binary file.** `grep`, `ripgrep` and every tool
 *    built on them skip it silently rather than reporting it — no error, no warning, just
 *    absence. `orders/service.ts`, `cutting/cutting.ts` and `quality/quality.ts` were
 *    invisible to repo-wide searches, and two audits drew wrong conclusions from their
 *    silence (one reported the orders module as unaudited; it has five `recordChange`
 *    calls). Anything that greps — a codemod, a secret scan, a CI gate — inherits that
 *    blind spot.
 *  - **Postgres rejects `\u0000` in `text` and `jsonb`.** These keys are in-memory today,
 *    so it never fired; the day one is persisted it throws at the database.
 *
 * U+001F INFORMATION SEPARATOR ONE is what ASCII designated for exactly this, and it is
 * not NUL, so a file containing it stays text. Written here as an escape rather than as
 * the literal character, which is the actual lesson: an invisible byte in source is a
 * problem whichever byte it is.
 *
 * The guarantee callers rely on: no value arriving from a form, a zod-parsed payload or an
 * extraction can contain U+001F, so `splitKey(compositeKey(a, b))` returns `[a, b]`.
 */
export const KEY_SEP = '\u001F'

/** Join parts into one Map/Set key. */
export function compositeKey(...parts: readonly string[]): string {
  return parts.join(KEY_SEP)
}

/** Take a composite key back apart, in the order it was built. */
export function splitKey(key: string): string[] {
  return key.split(KEY_SEP)
}
