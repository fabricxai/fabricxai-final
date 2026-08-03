'use client'

/**
 * The active language, for client components.
 *
 * Only the locale STRING crosses the server boundary — two bytes — and the catalogue is
 * imported into the browser bundle. The alternative, resolving the strings on the server and
 * passing a message dictionary as a prop, re-serialises every string this screen might say
 * into the RSC payload on every single navigation. The bundle is fetched once and cached; a
 * per-request dictionary is not, and this product is used on factory wifi.
 *
 * Both languages therefore ship to every client. That is the deliberate trade: one cached
 * download of two locales beats a per-request payload of one, and splitting the catalogue by
 * locale needs build-time plumbing that would have to be right in the worst network
 * conditions to pay for itself.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { translator, type Translator } from '@/lib/i18n-ui'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

/**
 * Mounted once per route group, with the locale the server resolved for this request.
 *
 * Deliberately not a client-side detector. A component that guesses the language from
 * `navigator.language` after hydration renders English first and then flips, which on a slow
 * tablet is a visible flash of the wrong language on every screen.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** The active locale. For formatting decisions — digits, dates — rather than copy. */
export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/**
 * The translator for this screen: `const t = useT()`, then `t('ui.store.receive_title')`.
 *
 * Named `t` at the call site by convention, because the surrounding markup is what should be
 * readable and `translate('ui.common.save')` in a button is longer than the button.
 */
export function useT(): Translator {
  const locale = useLocale()
  return useMemo(() => translator(locale), [locale])
}
