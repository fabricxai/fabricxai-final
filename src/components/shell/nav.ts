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
  section: NavSection
}

export type NavSection = 'work' | 'commercial' | 'floor' | 'oversight' | 'system'

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

/** The roles a person holds, as one readable phrase. */
export function describeRoles(roles: readonly Role[]): string {
  const named = roles.map((role) => ROLE_LABEL[role]).filter(Boolean)
  if (named.length === 0) return 'No role'
  if (named.length === 1) return named[0]!
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
}

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
/** The phrase the locked card uses for a module. */
export function lockedSubject(item: NavItem): string {
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
  return NAV.filter((item) => canSee(item, roles, factoryType))
}

export function navItemFor(href: string): NavItem | undefined {
  // Longest match wins so /orders/PO-88203 still resolves to the order desk.
  return [...NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => href === item.href || href.startsWith(`${item.href}/`))
}
