'use client'

/**
 * Sign-in and sign-up, when the render itself fails.
 *
 * Separate from the app boundary because the app boundary assumes the shell around it — a
 * sidebar, a top bar, a signed-in person. Here there is neither, and the reader is not yet
 * anybody: the copy must not imply their session is at fault or suggest they ask a
 * supervisor, because a locked-out owner at 6am has no supervisor to ask.
 */
import { useEffect } from 'react'

import { ErrorState } from '@/components/fx/feedback'
import { useLocale, useT } from '@/components/fx/locale'
import { actionErrorMessage } from '@/lib/action-error'

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()
  const locale = useLocale()

  useEffect(() => {
    console.error('[auth] route error:', error)
  }, [error])

  return (
    <ErrorState
      title={t('ui.boundary.auth_error_title')}
      body={actionErrorMessage(error, t('ui.boundary.auth_error_body'), locale)}
      onRetry={reset}
    />
  )
}
