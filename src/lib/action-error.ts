/**
 * Turning a failed server action into something a person can read.
 *
 * Every service throws `AppError(code, messageKey, details)`, and `messageKey` is exactly
 * the i18n key the reader should see. Across a server-action boundary, though, only
 * `Error.message` survives — Next serialises the message and drops the class, the code and
 * the details. So what reaches a client component is the literal string
 * `conflict: maintenance.errors.serial_exists`.
 *
 * Screens were rendering that. It is not a crash and it is not wrong, but it is a dotted
 * identifier where a sentence should be, and it teaches people that the system talks to
 * itself in front of them.
 *
 * **Parameters do not survive the boundary.** `details` — the serial that collided, the line
 * that was not found — is lost with the class, so the copy here cannot interpolate them.
 * That is why these messages say what happened and where to look rather than naming the
 * value: a message with a visible `{serial}` placeholder in it would be worse than the key.
 * Naming the value needs the action to return a typed failure instead of throwing, which is
 * a larger change than this file.
 */
import { DEFAULT_LOCALE, MESSAGES, t, type Locale } from './i18n'

/** `conflict: maintenance.errors.serial_exists` → `maintenance.errors.serial_exists`. */
const KEYED = /^[a-z_]+:\s*([a-z0-9_]+(?:\.[a-z0-9_]+)+)$/i

/**
 * The sentence to show for a caught action error.
 *
 * Falls back to the raw message when the key is not in the catalogue, rather than to
 * something generic. "Something went wrong" is the least useful sentence in software, and a
 * developer reading a bug report needs the key that was actually thrown.
 */
export function actionErrorMessage(
  error: unknown,
  fallback: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!(error instanceof Error)) return fallback

  const key = KEYED.exec(error.message)?.[1]
  if (!key) return error.message || fallback

  // `t` returns the key itself when it has no entry — which is what was being rendered
  // before, so treat it as "no copy exists" rather than as a translation.
  const copy = t(locale, key)
  if (copy !== key) return copy

  return MESSAGES[DEFAULT_LOCALE][key] ?? error.message
}
