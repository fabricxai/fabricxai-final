/**
 * Turning what somebody typed into a LIKE pattern.
 *
 * Shared because five modules now answer the command bar, and the escaping is the part
 * that is easy to get subtly wrong in one of them: `%` and `_` are wildcards to Postgres,
 * so a storekeeper searching for a style code containing an underscore would otherwise
 * match far more than they asked for. Not a security boundary — the value is still bound
 * as a parameter — but a correctness one.
 *
 * Every caller must pair this with `escape '\\'` in raw SQL, or use drizzle's `ilike`,
 * which does so already.
 */

/** The shortest query worth running across six tables. */
export const MIN_SEARCH_LENGTH = 3

export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, '\\$&')
}

/** `%term%`, with the caller's wildcards neutralised. */
export function likePattern(raw: string): string {
  return `%${escapeLike(raw.trim())}%`
}
