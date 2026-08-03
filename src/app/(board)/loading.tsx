/**
 * The board while its first read runs. Full-viewport and centred, because the board's own
 * layout has no shell to hold a loader inside.
 */
import { LoadingState } from '@/components/fx/feedback'
import { tui } from '@/lib/i18n-ui'
import { requestLocale } from '@/lib/ui-locale'

export default async function BoardLoading() {
  const locale = await requestLocale()

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--fx-bg-sunken)',
      }}
    >
      <LoadingState label={tui(locale, 'ui.common.loading')} />
    </div>
  )
}
