import { LoadingState } from '@/components/fx/feedback'
import { tui } from '@/lib/i18n-ui'
import { requestLocale } from '@/lib/ui-locale'

export default async function AuthLoading() {
  const locale = await requestLocale()
  return <LoadingState label={tui(locale, 'ui.common.loading')} />
}
