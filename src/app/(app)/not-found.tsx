/**
 * A record that is gone, or a link that outlived it.
 *
 * Eight dynamic routes call `notFound()` — an order, an LC, a UD, a sample, a PR, a BOM —
 * and until this file existed every one of them fell through to Next's stock 404, which does
 * not say whether the id was wrong or the row was deleted, and offers no way back into the
 * list the reader came from.
 *
 * Not a `LockedState`. A missing row and a forbidden row are different answers and must look
 * different: "no access" tells somebody to find a supervisor, "no longer exists" tells them
 * to check the list. Conflating them sends people to ask for permissions they already have.
 * (Access itself is refused in the shell, before this ever renders.)
 */
import Link from 'next/link'

import { EmptyState } from '@/components/fx/feedback'
import { tui } from '@/lib/i18n-ui'
import { requestLocale } from '@/lib/ui-locale'

export default async function AppNotFound() {
  const locale = await requestLocale()

  return (
    <EmptyState
      title={tui(locale, 'ui.boundary.not_found_title')}
      body={tui(locale, 'ui.boundary.not_found_body')}
      action={
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 'var(--fx-tap-min)',
            padding: '0 18px',
            borderRadius: 'var(--fx-radius-md)',
            border: '1px solid var(--fx-border-default)',
            background: 'var(--fx-bg-surface)',
            color: 'var(--fx-text-primary)',
            font: '600 14px/1 var(--fx-font-sans)',
            textDecoration: 'none',
          }}
        >
          {tui(locale, 'ui.boundary.not_found_back')}
        </Link>
      }
    />
  )
}
