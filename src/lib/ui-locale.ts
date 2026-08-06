/**
 * Which language this request is rendered in.
 *
 * Order: an explicit choice, then what the device asked for, then English.
 *
 * The explicit choice is a cookie rather than a column, for now. A column is the right home
 * for it — it belongs to the person, not the browser — but the Settings surface that would
 * write one does not exist yet (X.3), and a floor tablet is shared by three shifts anyway:
 * the cookie follows the DEVICE, which for a wall-mounted tablet in the cutting section is
 * closer to what is wanted than a preference attached to whichever supervisor last signed
 * in. When X.3 lands, the user's own setting takes precedence over this and the cookie
 * becomes the fallback.
 *
 * `accept-language` is a genuine signal here and not a guess: a phone bought in Dhaka and
 * used in Bangla sends `bn` without anybody configuring anything, which is exactly the
 * person this exists for.
 */
import { cookies, headers } from 'next/headers'

import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type Locale } from './i18n'

// Re-exported for callers that already import from here; the constant itself is defined in
// `lib/i18n.ts` so client components can name it without dragging `next/headers` along.
export { LOCALE_COOKIE }

/**
 * The locale for the current request. Server components and layouts only.
 *
 * Never throws and never blocks a render: an unreadable cookie store or a malformed header
 * resolves to English. A screen in the wrong language is a bad screen; a screen that 500s
 * because it could not decide on a language is no screen at all.
 */
export async function requestLocale(companyDefault?: string | null): Promise<Locale> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()])

  const chosen = cookieStore.get(LOCALE_COOKIE)?.value
  if (chosen) return resolveLocale(chosen)

  /*
   * The FACTORY's own language, before the device's (plan 5.8).
   *
   * `company_profiles.locale` was written on save and read by nothing, which made it a
   * setting that did nothing — worse than a missing one, because the screen implied a
   * choice was being honoured. It sits here rather than above the cookie because a shared
   * tablet's explicit switch is a person deciding for the shift in front of them, and a
   * company default should not override somebody standing at the machine.
   *
   * Above `accept-language`, though. A phone bought in Dhaka sends `bn` and a wall tablet
   * imaged in English sends `en`, and neither is a statement about what the factory runs in.
   */
  if (companyDefault) return resolveLocale(companyDefault)

  return localeFromAcceptLanguage(requestHeaders.get('accept-language'))
}

/**
 * First supported language in an `Accept-Language` header.
 *
 * Deliberately ignores q-weights and region subtags: `bn-BD`, `bn`, and `bn-IN;q=0.8` all
 * mean "this reader reads Bangla", and there are two languages to choose between. Parsing
 * the full grammar to arrive at the same answer would be code nobody can check.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE

  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase()
    if (!tag) continue
    const base = tag.split('-')[0]
    const resolved = resolveLocale(base)
    // resolveLocale answers DEFAULT_LOCALE for anything unsupported, so an early `en` and
    // an unsupported `fr` are indistinguishable by its return alone — compare the tag.
    if (base === resolved) return resolved
  }

  return DEFAULT_LOCALE
}
