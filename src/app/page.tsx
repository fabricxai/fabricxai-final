import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { visibleNav, type FactoryType } from '@/components/shell/nav'
import { getCtx } from '@/modules/core/session'
import { companyProfile } from '@/modules/settings/service'

/**
 * The root has no screen of its own. A signed-in caller goes to their work,
 * everyone else to the door.
 *
 * "Their work" is the first screen their own nav offers, not a fixed page. It used to send
 * everybody to `/approve`, which was harmless while every route rendered for everybody and
 * became a locked card the moment the shell started enforcing roles — a viewer signed in
 * and was told they had no access to the inbox, as a greeting.
 *
 * `visibleNav` is the same list the sidebar is built from, so the landing screen is by
 * definition one they can open. A caller whose nav is empty goes to `/settings`: every role
 * can read it, and somebody with no modules at all needs to see who to ask.
 */
export default async function Home() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const profile = await companyProfile(ctx)
  const factoryType: FactoryType = profile?.factoryType ?? 'woven'
  const [first] = visibleNav(ctx.roles, factoryType)

  redirect(first?.href ?? '/settings')
}
