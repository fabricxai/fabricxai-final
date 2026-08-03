import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MarbimButton } from '@/components/shell/marbim-button'
import { marbimEntryFor } from '@/components/shell/marbim-context'
import { MarbimPanel } from '@/components/shell/marbim-panel'
import { PageBody, TopBar } from '@/components/shell/page-shell'
import { Sidebar } from '@/components/shell/sidebar'
import { AccountMenu } from '@/components/shell/account-menu'
import {
  canSee,
  canWrite,
  describeRoles,
  lockedSubject,
  navItemFor,
  visibleNav,
  type FactoryType,
} from '@/components/shell/nav'
import { LockedState, ReadOnlyNote } from '@/components/fx/feedback'
import { LocaleProvider } from '@/components/fx/locale'
import { requestLocale } from '@/lib/ui-locale'
import { marbimTrust, routedPendingCount } from '@/modules/approvals/queries'
import type { ApprovalsPolicy } from '@/modules/approvals/service'
import { getCtx, signedInUser } from '@/modules/core/session'
import { providerId } from '@/modules/marbim/provider'
import { companyDisplayName, companyProfile, getPolicy } from '@/modules/settings/service'

/**
 * The authenticated shell.
 *
 * Nav is computed on the SERVER from the caller's roles and the unit's factory
 * type, so a module a role cannot open is never sent to the browser at all.
 * That is the "hidden" access pattern from the screens brief; "redacted" (masked
 * fields) stays inside each screen, because only the screen knows which fields
 * are sensitive.
 *
 * **"Locked" is enforced HERE, once, rather than per screen.** Hiding a link is not access
 * control: eighteen of the twenty-three destinations rendered in full for any signed-in
 * role that typed the address, so a storekeeper could read the LC register — every credit,
 * its value and the factory's open exposure — by knowing the word "lcs". Five pages called
 * `canSee` themselves and the rest never had it added, which is what happens to a check
 * that must be remembered twenty-three times.
 *
 * Doing it in the shell also covers nested routes: `navItemFor` longest-matches, so
 * `/lcs/{id}` and `/orders/{po}` are governed by their module's entry without each dynamic
 * route repeating anything. The pathname arrives from `src/proxy.ts`, since a layout is
 * never handed one.
 *
 * This is the LAST wall, not the only one. Every service still checks tenancy, every gate
 * still fails closed, and payroll still refuses at its own service boundary.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers()
  const ctx = await getCtx(requestHeaders)
  if (!ctx) redirect('/login')

  const [me, profile, displayName, trust, approvalsPolicy] = await Promise.all([
    signedInUser(requestHeaders),
    companyProfile(ctx),
    companyDisplayName(ctx),
    marbimTrust(ctx),
    getPolicy<ApprovalsPolicy>(ctx, 'approvals'),
  ])

  // The FAB badge counts what is routed to THIS reviewer, not every draft in the company.
  // A storekeeper whose inbox reads "Nothing routed to you" must not carry a "4" on every
  // screen — a badge that cannot be cleared is one people stop reading.
  const routed = await routedPendingCount(ctx, approvalsPolicy)
  const locale = await requestLocale()
  const factoryType: FactoryType = profile?.factoryType ?? 'woven'
  const nav = visibleNav(ctx.roles, factoryType)

  /*
   * Which screen is being rendered, and whether this role may.
   *
   * A path with no nav entry — `/board`, a sub-route nobody registered — is left alone
   * rather than refused. Guessing that an unknown path must be forbidden would lock people
   * out of screens by omission, which is the failure that is hardest to notice.
   */
  const pathname = requestHeaders.get('x-pathname') ?? ''
  const item = navItemFor(pathname)
  const allowed = !item || canSee(item, ctx.roles, factoryType)
  const readOnly = Boolean(item && allowed && !canWrite(item, ctx.roles, factoryType))

  return (
    <LocaleProvider locale={locale}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <TopBar
          companyName={displayName ?? 'FabricXAI'}
          account={
            <AccountMenu
              name={me?.name ?? null}
              email={me?.email ?? ''}
              roleLabel={describeRoles(ctx.roles)}
              companyName={displayName ?? 'FabricXAI'}
            />
          }
          actions={<MarbimButton />}
        />
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Sidebar items={nav} />
          <PageBody>
            {allowed ? (
              <>
                {/* Said before anything is typed, not after a button is pressed. The write
                    itself is still refused by the action — this is the label, not the lock. */}
                {readOnly ? <ReadOnlyNote what={item!.label} /> : null}
                {children}
              </>
            ) : (
              <LockedState what={lockedSubject(item!)} />
            )}
          </PageBody>
        </div>
        {/* X.2: MARBIM is a surface over whatever screen you are on, not a place you go. The
            FAB sits bottom-right of every screen and the panel opens over it; mounted here in
            the shell so the thread survives navigation. */}
        <MarbimPanel
          entry={{ ...marbimEntryFor(ctx.roles), model: providerId() }}
          trust={{ ...trust, pending: routed }}
        />
      </div>
    </LocaleProvider>
  )
}

