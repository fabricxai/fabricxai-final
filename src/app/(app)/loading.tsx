/**
 * What every app screen shows while its queries run.
 *
 * A server component is a suspense boundary whether or not anybody declared one; without
 * this file the browser simply held the previous screen, so on a floor tablet a tap looked
 * like it had been missed and got tapped again. The weave loader is the product's one
 * spinner, so this is four lines rather than a design decision.
 */
import { LoadingState } from '@/components/fx/feedback'
import { requestLocale } from '@/lib/ui-locale'
import { tui } from '@/lib/i18n-ui'

export default async function AppLoading() {
  const locale = await requestLocale()
  return <LoadingState label={tui(locale, 'ui.common.loading')} />
}
