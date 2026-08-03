'use client'

/**
 * The switch between English and Bangla.
 *
 * Without this the language was decided entirely by `Accept-Language` — so a storekeeper
 * on a shared tablet whose browser was set up in English had no way to reach the Bangla
 * screens at all, and every translated string in the product was unreachable for exactly
 * the person it was written for.
 *
 * ## It follows the DEVICE, not the account
 *
 * A cookie, not a column. On a floor tablet used by three shifts that is the behaviour you
 * want: the cutting section's tablet stays in Bangla regardless of which supervisor last
 * signed in, and the office laptop stays in English. When X.3 Settings ships a per-user
 * preference it should take precedence over this and leave the cookie as the fallback for
 * shared devices — see `lib/ui-locale.ts`.
 *
 * ## Why it re-renders the server
 *
 * The action revalidates the layout, so the server components come back in the new
 * language. Swapping a client-side context instead would leave every server-rendered
 * string — page headers, column names, empty states, which is most of them — in the old
 * language until the next navigation, so the switch would look broken on the very screen
 * you pressed it from.
 */
import { useTransition } from 'react'

import { setLocale } from '@/app/actions/locale'
import { LOCALES, type Locale } from '@/lib/i18n'

import { useLocale } from '../fx/locale'

/**
 * Each language named IN that language. A Bangla reader looking for their language should
 * not have to recognise the English word "Bengali" to find it.
 */
const LABEL: Record<Locale, string> = {
  en: 'English',
  bn: 'বাংলা',
}

export function LanguagePicker() {
  const active = useLocale()
  const [pending, startTransition] = useTransition()

  function choose(locale: Locale) {
    if (locale === active) return
    // The action writes the cookie and revalidates the layout, so every server-rendered
    // string on screen changes in the same round trip.
    startTransition(() => void setLocale(locale))
  }

  return (
    <div
      role="group"
      // Labelled in both languages, because the reader who needs this control is by
      // definition the one who may not read the other one.
      aria-label="Language · ভাষা"
      style={{ display: 'flex', gap: 6, opacity: pending ? 0.6 : 1 }}
    >
      {LOCALES.map((locale) => {
        const selected = locale === active
        return (
          <button
            key={locale}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => choose(locale)}
            style={{
              // Floor tap target, because this is reached on a tablet as often as a laptop.
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 'var(--fx-radius-full)',
              border: `1px solid ${selected ? 'var(--fx-accent)' : 'var(--fx-border-subtle)'}`,
              background: selected ? 'var(--fx-bg-sunken)' : 'transparent',
              color: selected ? 'var(--fx-text-primary)' : 'var(--fx-text-secondary)',
              font: `${selected ? 600 : 500} 13px/1 var(--fx-font-sans)`,
              cursor: pending || selected ? 'default' : 'pointer',
            }}
          >
            {LABEL[locale]}
          </button>
        )
      })}
    </div>
  )
}
