'use server'

/**
 * Set the display language for this device.
 *
 * A server action rather than a `document.cookie` write on the client: the cookie is read
 * on the server by `requestLocale()`, so setting it there means one place decides its
 * name, lifetime and flags — and `revalidatePath` in the same round trip re-renders the
 * server components that hold most of the product's strings. Writing it client-side and
 * then refreshing works, but splits the cookie's definition across two files and leaves
 * the flags to whoever edits the client next.
 *
 * No auth check, deliberately. This is a display preference that reveals nothing and
 * changes nothing but which column of the catalogue is read — and the sign-in page needs
 * it too, where by definition there is no session.
 */
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { LOCALE_COOKIE, resolveLocale } from '@/lib/i18n'

export async function setLocale(locale: string): Promise<void> {
  // Through resolveLocale, so an unsupported or hand-crafted value becomes English rather
  // than a cookie that makes every `t()` call miss.
  const resolved = resolveLocale(locale)

  const store = await cookies()
  store.set(LOCALE_COOKIE, resolved, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    // Not httpOnly: harmless to read, and a future client-side formatter may want it.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  // Everything, because the language affects every route — not just the one the picker
  // was pressed on.
  revalidatePath('/', 'layout')
}
