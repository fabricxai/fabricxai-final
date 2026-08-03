'use client'

/**
 * The wall board, when its data stops arriving.
 *
 * The one boundary in the product with no button, because there is nobody at the screen to
 * press it: this is bolted to a pillar and read from thirty feet. So it retries itself on a
 * timer and says that it is doing so — a board frozen on a stale number is worse than a
 * board that admits it is stale, because a supervisor will plan the next hour around a
 * figure that stopped updating at 14:00.
 *
 * Large type for the same reason. An error nobody can read from where they stand is a blank
 * screen with extra steps.
 */
import { useEffect } from 'react'

import { useT } from '@/components/fx/locale'

const RETRY_MS = 15_000

export default function BoardError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useT()

  useEffect(() => {
    console.error('[board] route error:', error)
  }, [error])

  useEffect(() => {
    // Unconditional, not exponential: a board is expected to be up permanently, and a
    // backoff that reaches ten minutes leaves a dead display through a whole shift change.
    const timer = setInterval(reset, RETRY_MS)
    return () => clearInterval(timer)
  }, [reset])

  return (
    <div
      role="alert"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 48,
        textAlign: 'center',
        background: 'var(--fx-bg-sunken)',
      }}
    >
      <div style={{ font: '700 44px/1.15 var(--fx-font-sans)', color: 'var(--fx-text-primary)' }}>
        {t('ui.boundary.board_error_title')}
      </div>
      <div style={{ font: '400 22px/1.4 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}>
        {t('ui.boundary.board_error_body')}
      </div>
    </div>
  )
}
