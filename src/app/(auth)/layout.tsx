import type { ReactNode } from 'react'

import { LocaleProvider } from '@/components/fx/locale'
import { Lockup } from '@/components/fx/signature'
import { requestLocale } from '@/lib/ui-locale'

/**
 * The auth wash — one of the weave field's four sanctioned uses, and the only
 * place in the product it covers this much of the viewport. It sits behind the
 * lockup and the card, never behind the form's own copy.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const locale = await requestLocale()

  return (
    <LocaleProvider locale={locale}>
      <div
        className="fx-weave"
        style={{
          minHeight: '100dvh',
          backgroundColor: 'var(--fx-bg-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 28 }}
        >
          <Lockup height={34} />
          {children}
        </div>
      </div>
    </LocaleProvider>
  )
}
