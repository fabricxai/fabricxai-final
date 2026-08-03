'use client'

/**
 * The last boundary: the root layout itself failed.
 *
 * Nothing from the app is available here — no shell, no theme provider, no locale context,
 * because the tree that would have provided them is what broke. Next also requires this file
 * to render its own `<html>` and `<body>`.
 *
 * So the language is read straight off the cookie. Reaching into `document.cookie` is not
 * how anything else in the product resolves a locale, and it is right here for the same
 * reason the rest of this file is unusual: the mechanism that would normally answer the
 * question is upstream of the failure. English is the fallback, as everywhere else.
 */
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from '@/lib/i18n'
import { tui } from '@/lib/i18n-ui'

function cookieLocale() {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`))
  return resolveLocale(match?.[1] && decodeURIComponent(match[1]))
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = cookieLocale()

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          textAlign: 'center',
          // Literal values, not tokens: theme.css is a stylesheet this tree may not have.
          background: '#faf9f7',
          color: '#1a1917',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
          {tui(locale, 'ui.boundary.error_title')}
        </h1>
        <p style={{ margin: 0, maxWidth: '46ch', lineHeight: 1.55, color: '#57534e' }}>
          {tui(locale, 'ui.boundary.error_body')}
        </p>
        {error.digest ? (
          <code style={{ fontSize: 12, color: '#78716c' }}>
            {tui(locale, 'ui.boundary.error_digest')}: {error.digest}
          </code>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 44,
            padding: '0 20px',
            borderRadius: 8,
            border: '1px solid #d6d3d1',
            background: '#fff',
            font: '600 14px/1 system-ui, sans-serif',
            cursor: 'pointer',
          }}
        >
          {tui(locale, 'ui.common.retry')}
        </button>
      </body>
    </html>
  )
}
