'use client'

/**
 * The app shell's error boundary.
 *
 * Every screen in `(app)` is `force-dynamic` and awaits several database reads, so one
 * failed query is one unhandled rejection. Without this file all 56 of them rendered Next's
 * default error page — in development a stack trace, in production a blank frame with no
 * indication of whether the operator's work had been saved.
 *
 * Three decisions:
 *
 *  1. **It says nothing was saved.** That is true here: a server component throwing means
 *     the render failed, not that a write half-happened. It is also the only thing the
 *     person actually wants to know, and the reason "Something went wrong" is useless.
 *  2. **It resolves the thrown key.** A service throws `AppError('not_found', 'x.y')` and
 *     the boundary receives `Error` with the message `not_found: x.y` — so a gate refusal or
 *     a missing row reads as its own sentence rather than as a dotted identifier.
 *  3. **`digest` is shown, labelled as a reference.** Next replaces production error
 *     messages with an opaque digest; showing it lets a supervisor read something back over
 *     the phone that matches a server log line.
 */
import { useEffect } from 'react'

import { ErrorState } from '@/components/fx/feedback'
import { useLocale, useT } from '@/components/fx/locale'
import { actionErrorMessage } from '@/lib/action-error'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()
  const locale = useLocale()

  useEffect(() => {
    // Until Sentry is wired (audit INFRA-B5) the console is the only sink there is. A
    // boundary that swallows the error entirely leaves nothing to debug from at all.
    console.error('[app] route error:', error)
  }, [error])

  // Falls back to the generic body only when the error carries no key of its own.
  const detail = actionErrorMessage(error, t('ui.boundary.error_body'), locale)

  return (
    <ErrorState
      title={t('ui.boundary.error_title')}
      body={
        <>
          {detail}
          {error.digest ? (
            <div
              style={{
                marginTop: 10,
                font: '400 12px/1.4 var(--fx-font-mono)',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {t('ui.boundary.error_digest')}: {error.digest}
            </div>
          ) : null}
        </>
      }
      onRetry={reset}
    />
  )
}
