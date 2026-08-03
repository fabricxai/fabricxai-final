import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { getCtx } from '@/modules/core/session'

/**
 * The wall-display shell — authentication and nothing else.
 *
 * Deliberately not the app shell. A board bolted to a pillar has no navigation, no MARBIM
 * FAB and no avatar, because nobody is sitting at it: a sidebar on a screen read from thirty
 * feet is a third of the display spent on links nobody can click.
 *
 * It is still behind auth. Production numbers are a tenant's own business, and the tablet
 * that gets left signed in on a factory floor is exactly the reason this checks a session
 * rather than trusting the URL to be obscure.
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  return <>{children}</>
}
