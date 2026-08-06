import type { Role } from '@/modules/core/ctx'

/**
 * The navigation registry — one entry per designed screen.
 *
 * This is where two access rules from the screens brief live:
 *
 *  - Roles. A role with no access gets the module HIDDEN (absent from nav),
 *    not a disabled link. A link you can see and cannot use still tells you
 *    the module exists and roughly what it holds.
 *  - Factory type. `[WOVEN]` screens appear only for woven units and
 *    `[KNIT-COMPOSITE]` only for composite units; everything else is shared.
 *
 * The third pattern — redaction — is per-field and lives in the screens.
 */

export type FactoryType = 'woven' | 'knit' | 'knit-composite'

export interface NavItem {
  id: string
  label: string
  href: string
  /** Roles that may see this module at all. Owner and admin always may. */
  roles: readonly Role[]
  /**
   * Roles that may CHANGE anything here. Absent means everyone who can see it can.
   *
   * The gap this closes: a role could open a screen and only discover it could not act by
   * pressing a button and reading a refusal. Declaring it here lets the shell say so before
   * anybody types anything — and keeps the answer next to the visibility rule it belongs
   * with, rather than in twenty-three screens.
   *
   * This is a LABEL, not the enforcement. Every write still goes through an action that
   * checks for itself; a read-only banner nobody honours would be worse than none.
   */
  writeRoles?: readonly Role[]
  /**
   * How the locked card names this module — "you don't have access to {lockedAs}".
   *
   * Separate from `label` because a sidebar entry and a sentence want different words:
   * "Owner dashboard" reads as a heading, "the owner dashboard" reads as English. Absent
   * means the label, lowercased, which is right for most of them.
   *
   * It matters that the refusal names the specific module rather than something generic —
   * `role-gates.integration.test.ts` asserts exactly that, because a card saying only
   * "no access" leaves somebody unsure which of the things they tried was refused.
   */
  lockedAs?: string
  /** Restrict to particular factory types. Absent means shared. */
  factoryTypes?: readonly FactoryType[]
  /**
   * Governed here, but not listed in the sidebar.
   *
   * For screens reached from dedicated chrome rather than the nav — `/factory` opens from
   * the top-bar chip. Without this they had to be left out of the registry altogether, and
   * a route outside the registry is a route with no access policy at all. It stays
   * findable (search reads `NAV` directly) and stays refusable; it just isn't in the list.
   */
  hiddenFromSidebar?: boolean
  section: NavSection
}

export type NavSection = 'work' | 'commercial' | 'floor' | 'oversight' | 'system'

/**
 * Where the chrome's words live (plan 4.2).
 *
 * The labels below stayed English literals long after twelve floor routes read Bangla, so a
 * Bangla-only worker could read their screen and not the link to it. The copy now comes from
 * `ui.nav.*` / `ui.role.*` in `lib/i18n-ui`, keyed on the NAV entry's own id.
 *
 * The English is still HERE as well, and deliberately: it is what `access.test.ts` asserts
 * against, what a non-localised caller falls back to, and — through `nav-copy.test.ts` —
 * what the catalogue's English is checked to agree with. Two copies that must match, with a
 * test that fails when they stop, beats one copy that a screen renders as `ui.nav.orders`
 * the day somebody mistypes an id.
 */
export const navLabelKey = (id: string): string => `ui.nav.${id}`
export const navLockedKey = (id: string): string => `ui.nav.locked_${id}`
export const navSectionKey = (id: NavSection): string => `ui.nav.section_${id}`
export const roleLabelKey = (role: Role): string => `ui.role.${role}`

/** Just enough of a translator for this file to stay free of React and of `next/headers`. */
export type Words = (key: string, params?: Readonly<Record<string, unknown>>) => string

/**
 * What each role is called, in the words the factory uses.
 *
 * The app knew everybody's role and never said it. A storekeeper could tell they were a
 * storekeeper only by noticing their nav was short — which does not distinguish "this is
 * not yours" from "this does not exist", and tells them nothing about what they may change
 * on a screen they CAN open.
 */
export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  owner: 'Owner',
  admin: 'Admin',
  merchandiser: 'Merchandiser',
  commercial: 'Commercial',
  planner: 'Planner',
  store: 'Storekeeper',
  procurement: 'Procurement',
  cutting: 'Cutting',
  production: 'Production',
  quality: 'Quality',
  shipment: 'Shipment',
  maintenance: 'Maintenance',
  hr: 'HR',
  compliance: 'Compliance',
  finance: 'Finance',
  member: 'Member',
  viewer: 'Viewer',
}

/**
 * The roles a person holds, as one readable phrase, in the reader's language.
 *
 * The conjunction is copy, not punctuation — Bangla joins with ও, not with "and" — so the
 * last join comes from the catalogue rather than from a template literal here.
 */
export function describeRoles(roles: readonly Role[], words?: Words): string {
  const say: Words = words ?? englishFallback
  const named = roles.map((role) => say(roleLabelKey(role))).filter(Boolean)

  if (named.length === 0) return say('ui.nav.no_role')
  if (named.length === 1) return named[0]!
  return say('ui.nav.roles_and', {
    list: named.slice(0, -1).join(', '),
    last: named[named.length - 1]!,
  })
}

/**
 * What `describeRoles` says with no translator.
 *
 * Only reached by callers outside a request — a job, a test, a script. Kept minimal on
 * purpose: this is a fallback, not a second catalogue, and anything rendered to a person
 * goes through the real one.
 */
const ENGLISH_FALLBACK: Readonly<Record<string, string>> = {
  'ui.nav.no_role': 'No role',
  'ui.nav.roles_and': '{list} and {last}',
  ...Object.fromEntries(
    Object.entries(ROLE_LABEL).map(([role, label]) => [roleLabelKey(role as Role), label]),
  ),
}

const englishFallback: Words = (key, params = {}) =>
  Object.entries(params).reduce<string>(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    ENGLISH_FALLBACK[key] ?? key,
  )

export const NAV_SECTIONS: readonly { id: NavSection; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'floor', label: 'Floor' },
  { id: 'oversight', label: 'Oversight' },
  { id: 'system', label: 'System' },
]

/** Roles that see everything. Kept separate so each entry lists only its own. */
const ALL_ACCESS: readonly Role[] = ['owner', 'admin']

export const NAV: readonly NavItem[] = [
  // ── Work ────────────────────────────────────────────────
  {
    id: 'approve',
    label: 'Approve inbox',
    href: '/approve',
    section: 'work',
    // Everyone who can approve anything lands here; the inbox itself filters
    // to what this role may actually decide.
    roles: ['merchandiser', 'commercial', 'planner', 'store', 'procurement', 'production', 'quality', 'compliance', 'finance', 'hr'],
  },
  {
    id: 'marbim',
    label: 'MARBIM',
    href: '/marbim',
    section: 'work',
    roles: ['merchandiser', 'commercial', 'planner', 'store', 'procurement', 'cutting', 'production', 'quality', 'shipment', 'maintenance', 'hr', 'compliance', 'finance', 'member', 'viewer'],
    // No `writeRoles`: MARBIM writes nothing itself. Everything it produces is a draft in
    // somebody's approve inbox, so asking it a question is a read however it is phrased.
  },
  {
    id: 'orders',
    label: 'Order desk & TNA',
    href: '/orders',
    section: 'work',
    roles: ['merchandiser', 'commercial', 'planner', 'production', 'viewer'],
    // A viewer is on the order book to read it. Production is here for dates and the
    // breakdown, not to change what the buyer ordered.
    writeRoles: ['merchandiser', 'commercial', 'planner'],
  },
  {
    id: 'memory',
    label: 'Order memory',
    href: '/memory',
    section: 'work',
    roles: ['merchandiser', 'commercial', 'planner'],
  },
  {
    id: 'sampling',
    label: 'Sampling room',
    href: '/sampling',
    section: 'work',
    roles: ['merchandiser', 'quality', 'production'],
  },

  // ── Commercial ──────────────────────────────────────────
  {
    id: 'buyers',
    label: 'Buyer & lead desk',
    href: '/buyers',
    section: 'commercial',
    roles: ['merchandiser', 'commercial'],
  },
  {
    id: 'rfq',
    label: 'RFQ & quotation',
    href: '/rfq',
    section: 'commercial',
    roles: ['merchandiser', 'commercial'],
  },
  {
    id: 'costing',
    label: 'Costing studio',
    href: '/costing',
    section: 'commercial',
    roles: ['merchandiser', 'commercial', 'finance'],
  },
  {
    id: 'lcs',
    label: 'LC register',
    href: '/lcs',
    section: 'commercial',
    roles: ['commercial', 'finance'],
  },
  {
    id: 'finance',
    label: 'Commercial finance',
    href: '/finance',
    section: 'commercial',
    roles: ['commercial', 'finance'],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    href: '/procurement',
    section: 'commercial',
    roles: ['procurement', 'commercial', 'store'],
  },

  // ── Floor ───────────────────────────────────────────────
  {
    id: 'planning',
    label: 'Planning board',
    href: '/planning',
    section: 'floor',
    roles: ['planner', 'production', 'merchandiser'],
  },
  {
    id: 'store',
    label: 'Store',
    href: '/store',
    section: 'floor',
    roles: ['store', 'procurement', 'production'],
  },
  {
    id: 'ud',
    lockedAs: 'the UD workbench',
    label: 'UD workbench',
    href: '/ud',
    section: 'floor',
    // Bonded fabric is a woven-unit concern: the shell fabric is imported
    // duty-free against a UD. Knit units buy or knit their own.
    factoryTypes: ['woven'],
    roles: ['store', 'commercial', 'compliance'],
  },
  {
    id: 'cutting',
    label: 'Cutting',
    href: '/cutting',
    section: 'floor',
    roles: ['cutting', 'production', 'planner'],
  },
  {
    id: 'lines',
    label: 'Line tracking',
    href: '/lines',
    section: 'floor',
    roles: ['production', 'planner', 'quality'],
  },
  {
    id: 'quality',
    label: 'Quality',
    href: '/quality',
    section: 'floor',
    roles: ['quality', 'production'],
  },
  {
    id: 'shipment',
    label: 'Shipment',
    href: '/shipment',
    section: 'floor',
    roles: ['shipment', 'commercial', 'merchandiser'],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    href: '/maintenance',
    section: 'floor',
    roles: ['maintenance', 'production'],
  },

  // ── Oversight ───────────────────────────────────────────
  {
    id: 'dashboard',
    lockedAs: 'the owner dashboard',
    label: 'Owner dashboard',
    href: '/dashboard',
    section: 'oversight',
    // Deliberately narrow. This is the whole-factory view.
    roles: [],
  },
  {
    id: 'workforce',
    lockedAs: 'workforce',
    label: 'Workforce & payroll',
    href: '/workforce',
    section: 'oversight',
    // Payroll is hr+owner at API level; anyone else gets a quiet 403 card.
    roles: ['hr'],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    href: '/compliance',
    section: 'oversight',
    roles: ['compliance'],
  },

  // ── System ──────────────────────────────────────────────
  {
    id: 'factory',
    lockedAs: 'the factory profile',
    label: 'Factory',
    href: '/factory',
    section: 'system',
    // Opens from the top-bar chip, not the sidebar — but it is still a screen with an
    // audience, so it is registered like any other. Same readership as Settings: everybody
    // may read how their unit is configured. Nothing here is editable by anyone; the page
    // sends you to Settings, which is where the permission actually is.
    hiddenFromSidebar: true,
    roles: ['member', 'viewer', 'merchandiser', 'commercial', 'planner', 'store', 'procurement', 'cutting', 'production', 'quality', 'shipment', 'maintenance', 'hr', 'compliance', 'finance'],
    writeRoles: [],
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    section: 'system',
    roles: ['member', 'viewer', 'merchandiser', 'commercial', 'planner', 'store', 'procurement', 'cutting', 'production', 'quality', 'shipment', 'maintenance', 'hr', 'compliance', 'finance'],
    // Everybody may read how their factory is configured — a policy you cannot see is one
    // you cannot question. Changing one is owner and admin only, which `settings.errors
    // .policy_is_admin_only` already enforces; this is the same rule said before the click.
    writeRoles: [],
  },
]

/**
 * May this role change anything on this screen?
 *
 * Takes `factoryType` and re-checks visibility first, so the answer is true only for a
 * screen the caller can actually open. Without that it returned true for screens a role
 * cannot see at all — harmless where the shell calls it, since it only asks about a screen
 * it has already allowed, and a trap for the next caller who asks it on its own.
 *
 * Owner and admin always may. A screen with no `writeRoles` is one where seeing it and
 * using it are the same permission.
 */
/**
 * The phrase the locked card uses for a module.
 *
 * With no translator this is the English data on the entry, which is what `access.test.ts`
 * and `role-gates.integration.test.ts` assert — a refusal that names the specific module
 * rather than saying only "no access", so somebody who tried three things knows which one
 * was refused.
 *
 * With one it comes from `ui.nav.locked_<id>`, whose English side says exactly the same
 * words. The two exist because a heading and a sentence want different ones: "Owner
 * dashboard" reads as a heading and "the owner dashboard" reads as English — and Bangla
 * takes no article at all, so its side is the plain name.
 */
export function lockedSubject(item: NavItem, words?: Words): string {
  if (words) return words(navLockedKey(item.id))
  return item.lockedAs ?? item.label.toLowerCase()
}

export function canWrite(
  item: NavItem,
  roles: readonly Role[],
  factoryType: FactoryType,
): boolean {
  if (!canSee(item, roles, factoryType)) return false
  if (roles.some((r) => ALL_ACCESS.includes(r))) return true
  if (!item.writeRoles) return true
  return roles.some((r) => item.writeRoles!.includes(r))
}

export function canSee(item: NavItem, roles: readonly Role[], factoryType: FactoryType): boolean {
  if (item.factoryTypes && !item.factoryTypes.includes(factoryType)) return false
  if (roles.some((r) => ALL_ACCESS.includes(r))) return true
  return roles.some((r) => item.roles.includes(r))
}

export function visibleNav(roles: readonly Role[], factoryType: FactoryType): NavItem[] {
  return NAV.filter((item) => !item.hiddenFromSidebar && canSee(item, roles, factoryType))
}

/**
 * The shell's whole access decision for one path, in one place.
 *
 * Extracted from the layout so it can be asserted directly rather than by reading the
 * layout's source: a policy that can only be tested by grepping the file that applies it
 * is a policy nobody can change with confidence.
 *
 * **A path with no entry is refused.** The registry IS the access policy, so a route
 * missing from it has no policy — and "no policy" must never read as "no restriction".
 * `/factory` shipped exactly that way: reachable by URL, absent from `NAV`, and therefore
 * open to every signed-in role whatever its entry would have said.
 *
 * The cost of failing closed is that a forgotten entry locks a screen rather than exposing
 * it. That is the trade worth making — somebody reports a locked screen within the hour,
 * and nobody reports an open one — and `access.test.ts` sweeps every page in the group so
 * the omission fails CI long before anybody meets it.
 */
export interface RouteAccess {
  item: NavItem | undefined
  allowed: boolean
  readOnly: boolean
  /** What the locked card names, when it has to render one. */
  subject: string
}

export function resolveAccess(
  pathname: string,
  roles: readonly Role[],
  factoryType: FactoryType,
  words?: Words,
): RouteAccess {
  const item = navItemFor(pathname)
  if (!item) {
    return {
      item: undefined,
      allowed: false,
      readOnly: false,
      subject: words ? words('ui.nav.this_screen') : 'this screen',
    }
  }

  const allowed = canSee(item, roles, factoryType)
  return {
    item,
    allowed,
    // Never both: a "read only" banner on a screen the caller cannot open would be two
    // contradictory statements about the same permission.
    readOnly: allowed && !canWrite(item, roles, factoryType),
    subject: lockedSubject(item, words),
  }
}

export function navItemFor(href: string): NavItem | undefined {
  // Longest match wins so /orders/PO-88203 still resolves to the order desk.
  return [...NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => href === item.href || href.startsWith(`${item.href}/`))
}
