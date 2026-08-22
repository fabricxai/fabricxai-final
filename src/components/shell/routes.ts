/**
 * The route registry — every page and sub-page, and the words a person reads for it.
 *
 * `nav.ts` answers "may this role open this URL, and which sidebar entry lights up".
 * It knows only top-level module hrefs; `navItemFor` resolves `/orders/abc/fabric` to
 * the orders entry by longest-prefix, which is right for access and useless for saying
 * where you are. This file answers the other half: what is this screen called, what is
 * it inside, and what is one step back.
 *
 * ## Why a registry rather than a prop on each page
 *
 * Breadcrumbs were hand-written at eight call sites and absent from the other seventeen
 * sub-pages, so two thirds of the app could be reached and not left. The trail also has
 * to agree with itself — `/costing/bom/[bomId]` must call its parent exactly what
 * `/costing/bom` calls itself, in both languages — and hand-written arrays drift the
 * moment one of them is renamed. Declaring the tree once means a new sub-page gets its
 * trail, its back link and its Bangla by being listed, and `routes.test.ts` fails the
 * build if a `page.tsx` exists on disk with no entry here.
 *
 * ## Dynamic segments
 *
 * A `[param]` segment has no label until a row is loaded, so the page supplies it:
 * `routeTrail('/orders/abc-123/fabric', { labels: { orderId: 'PO-88203' } })` reads
 * "Order desk / PO-88203 / Where the fabric is". Without a label the raw segment shows,
 * which is ugly but never wrong — an id is at least a true thing to call a row.
 */
import type { Locale } from '@/lib/i18n'
import { tui } from '@/lib/i18n-ui'

import { navLabelKey, NAV } from './nav'

export interface RouteDef {
  /** URL pattern with `[param]` for dynamic segments, e.g. `/orders/[orderId]/fabric`. */
  readonly pattern: string
  /**
   * English label — the crumb, and the fallback when a locale has no key. Kept here
   * rather than only in the catalogue so the tree reads as a tree in one file.
   */
  readonly label: string
}

export interface Crumb {
  readonly label: string
  /** Absent on the last crumb: you are already there. */
  readonly href?: string
}

/**
 * Every route, parents before children.
 *
 * Top-level labels match `NAV[].label` (asserted by `routes.test.ts`) so the sidebar and
 * the trail cannot disagree about what a module is called. Sub-page labels are the words
 * that were already on those screens.
 */
export const ROUTES: readonly RouteDef[] = [
  // ── Work ──
  { pattern: '/home', label: 'Your work' },
  { pattern: '/approve', label: 'Approve inbox' },
  { pattern: '/marbim', label: 'MARBIM' },
  { pattern: '/marbim/intake', label: 'Read a document' },

  { pattern: '/orders', label: 'Order desk & TNA' },
  { pattern: '/orders/inputs', label: 'Inputs readiness' },
  { pattern: '/orders/[orderId]', label: 'Order' },
  { pattern: '/orders/[orderId]/documents', label: 'Style and documents' },

  { pattern: '/memory', label: 'Order memory' },

  { pattern: '/sampling', label: 'Sampling room' },
  { pattern: '/sampling/library', label: 'Library' },
  { pattern: '/sampling/[sampleId]', label: 'Sample' },

  // ── Commercial ──
  { pattern: '/buyers', label: 'Buyer & lead desk' },
  { pattern: '/buyers/waiting', label: 'Waiting on the buyer' },
  { pattern: '/rfq', label: 'RFQ & quotation' },
  { pattern: '/costing', label: 'Costing studio' },
  { pattern: '/costing/bom', label: 'Bills of materials' },
  { pattern: '/costing/bom/[bomId]', label: 'Bill of materials' },
  { pattern: '/lcs', label: 'LC register' },
  { pattern: '/lcs/submissions', label: 'Documents at the bank' },
  { pattern: '/lcs/[lcId]', label: 'Letter of credit' },
  { pattern: '/finance', label: 'Commercial finance' },
  { pattern: '/procurement', label: 'Procurement' },
  { pattern: '/procurement/receipts', label: 'Goods in' },
  { pattern: '/procurement/scorecard', label: 'Scorecard' },
  { pattern: '/procurement/[prId]', label: 'Purchase request' },

  // ── Floor ──
  { pattern: '/planning', label: 'Planning board' },
  { pattern: '/store', label: 'Store' },
  { pattern: '/store/receive', label: 'Receive' },
  { pattern: '/store/issue', label: 'Issue' },
  { pattern: '/store/rolls', label: 'Rolls' },
  { pattern: '/ud', label: 'UD workbench' },
  { pattern: '/ud/[udId]', label: 'Utilization declaration' },
  { pattern: '/cutting', label: 'Cutting' },
  { pattern: '/cutting/lay', label: 'Lay planning' },
  { pattern: '/cutting/report', label: 'Cutting report' },
  { pattern: '/cutting/wastage', label: 'Wastage' },
  { pattern: '/lines', label: 'Line tracking' },
  { pattern: '/lines/hourly', label: 'Hourly output' },
  { pattern: '/lines/endline', label: 'Endline' },
  { pattern: '/quality', label: 'Quality' },
  { pattern: '/quality/inline', label: 'Inline' },
  { pattern: '/quality/final', label: 'Final inspection' },
  { pattern: '/quality/fabric', label: 'Fabric inspection' },
  { pattern: '/quality/measurements', label: 'Measurements' },
  { pattern: '/shipment', label: 'Shipment' },
  { pattern: '/shipment/packing', label: 'Packing' },
  { pattern: '/maintenance', label: 'Maintenance' },
  { pattern: '/maintenance/machines', label: 'Machine registry' },
  { pattern: '/maintenance/pm', label: 'Preventive maintenance' },

  // ── Oversight ──
  { pattern: '/dashboard', label: 'Owner dashboard' },
  { pattern: '/workforce', label: 'Workforce & payroll' },
  { pattern: '/compliance', label: 'Compliance' },
  { pattern: '/refused', label: 'Refused writes' },

  // ── System ──
  { pattern: '/factory', label: 'Factory' },
  { pattern: '/setup', label: 'Factory setup' },
  { pattern: '/settings', label: 'Settings' },
]

const BY_PATTERN = new Map(ROUTES.map((r) => [r.pattern, r]))

/**
 * The i18n key for a route's label: `/orders/[orderId]/documents` →
 * `ui.route.orders_id_documents`.
 *
 * A module's own page borrows the sidebar's key instead of minting a second one. The
 * trail and the sidebar entry are the same word to a reader, and two keys for one word
 * is how they end up saying different things in Bangla.
 *
 * Every `[param]` collapses to `id` rather than carrying the parameter's name, so renaming
 * `[orderId]` to `[id]` in the folder tree does not silently orphan a translation.
 */
export function routeLabelKey(pattern: string): string {
  const nav = NAV.find((n) => n.href === pattern)
  if (nav) return navLabelKey(nav.id)

  const slug = pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => (isDynamic(seg) ? 'id' : seg))
    .join('_')
  return `ui.route.${slug || 'root'}`
}

function isDynamic(segment: string): boolean {
  return segment.startsWith('[') && segment.endsWith(']')
}

function paramName(segment: string): string {
  return segment.slice(1, -1).replace(/^\.\.\./, '')
}

function matches(pattern: string, segments: readonly string[]): boolean {
  const parts = pattern.split('/').filter(Boolean)
  if (parts.length !== segments.length) return false
  return parts.every((part, i) => (isDynamic(part) ? true : part === segments[i]))
}

/**
 * The registered pattern for a concrete path, or null.
 *
 * A literal beats a dynamic segment at the same depth, so `/orders/inputs` resolves to
 * itself rather than to `/orders/[orderId]` — otherwise a page named like a parameter
 * would be shadowed by its own sibling, which is how `/orders/inputs` would have ended
 * up captioned with a UUID.
 */
export function routePattern(pathname: string): string | null {
  const segments = clean(pathname)
  const candidates = ROUTES.filter((r) => matches(r.pattern, segments))
  const literal = candidates.find((r) => !r.pattern.split('/').some(isDynamic))
  const chosen = literal ?? candidates[0]
  return chosen ? chosen.pattern : null
}

function clean(pathname: string): string[] {
  const [beforeQuery = ''] = pathname.split('?')
  const [path = ''] = beforeQuery.split('#')
  return path.split('/').filter(Boolean)
}

export interface TrailOptions {
  /** Labels for dynamic segments, keyed by parameter name: `{ orderId: 'PO-88203' }`. */
  readonly labels?: Readonly<Record<string, string>>
  /** Render the trail in this locale. Omitted: English, from `ROUTES`. */
  readonly locale?: Locale
}

/**
 * The crumb trail for a concrete path, ancestors first, the current page last.
 *
 * Ancestors that are not registered are skipped rather than guessed at — a gap in the
 * middle of a trail is a missing registry entry, and `routes.test.ts` catches those
 * before a person sees one.
 */
export function routeTrail(pathname: string, opts: TrailOptions = {}): readonly Crumb[] {
  const segments = clean(pathname)
  const crumbs: Crumb[] = []

  for (let depth = 1; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth)
    const pattern = routePattern(`/${prefix.join('/')}`)
    if (!pattern) continue

    const last = depth === segments.length
    crumbs.push({
      label: crumbLabel(pattern, prefix[depth - 1] ?? '', opts),
      href: last ? undefined : `/${prefix.join('/')}`,
    })
  }

  return crumbs
}

function crumbLabel(pattern: string, segment: string, opts: TrailOptions): string {
  const parts = pattern.split('/').filter(Boolean)
  const leaf = parts[parts.length - 1] ?? ''

  // A dynamic leaf is a row, and only the page that loaded it knows what it is called.
  if (isDynamic(leaf)) {
    return opts.labels?.[paramName(leaf)] ?? segment
  }

  const def = BY_PATTERN.get(pattern)
  const english = def?.label ?? segment
  if (!opts.locale) return english

  const key = routeLabelKey(pattern)
  const translated = tui(opts.locale, key)
  // `tui` renders a missing key as itself, greppably. English is a better screen than that.
  return translated === key ? english : translated
}

/**
 * One step back: the parent crumb, or null at the top of a section.
 *
 * This is what a `back` link points at, and it is deliberately the parent in the tree
 * rather than the browser's history — a person who arrived at an order from a MARBIM
 * answer should still be offered the order desk, not sent back into the chat.
 */
export function routeParent(pathname: string, opts: TrailOptions = {}): Crumb | null {
  const trail = routeTrail(pathname, opts)
  const parent = trail[trail.length - 2]
  return parent?.href ? parent : null
}

/** The registered English label for a path, for places that want a name and no trail. */
export function routeLabel(pathname: string, opts: TrailOptions = {}): string | null {
  const trail = routeTrail(pathname, opts)
  return trail[trail.length - 1]?.label ?? null
}
