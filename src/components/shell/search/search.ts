import 'server-only'

import { canSee, NAV, type FactoryType } from '@/components/shell/nav'
import { MIN_SEARCH_LENGTH } from '@/lib/search-text'
import { searchBuyers, searchLeads } from '@/modules/buyers/queries'
import { searchLcs } from '@/modules/commercial/queries'
import { searchUds } from '@/modules/commercial/ud-queries'
import type { AnyCtx } from '@/modules/core/ctx'
import { searchOrders } from '@/modules/orders/queries'
import { searchRequisitions } from '@/modules/procurement/queries'
import { searchSampleRequests } from '@/modules/sampling/queries'

import type { SearchHit } from './search-types'

export type { SearchHit, SearchHitKind } from './search-types'

/**
 * Shell command search — jump to a module, or to a record the caller's role may open.
 *
 * Every hit is gated the same way the sidebar is: if `canSee` would hide the module, this
 * asks its owner nothing. Tenancy is the wall underneath (each read runs scoped).
 *
 * **This file owns no SQL.** It shipped importing the raw schemas of six modules and
 * querying them directly, which broke rule 11 (read through the owner's `queries.ts`) and
 * rule 1 (db access lives in the service layer) — and did it from `src/components/`, which
 * was outside every lint glob that would have caught either. The reads now belong to the
 * modules that own those tables; what is left here is what a search box legitimately
 * decides: who may see what, and how a hit is worded.
 *
 * Each owner opens its own scoped read, so this is six short transactions rather than one
 * long one. They run concurrently, and the 3-character minimum plus the rate limit on the
 * action keep the fan-out off the floor's connection budget. There is still no global FTS
 * index; ILIKE is enough for a command bar over one factory.
 */

const PER_KIND = 5

function maySee(ctx: AnyCtx, factoryType: FactoryType, id: string): boolean {
  const item = NAV.find((entry) => entry.id === id)
  return item ? canSee(item, ctx.roles, factoryType) : false
}

export async function searchFactory(
  ctx: AnyCtx,
  input: { query: string; factoryType: FactoryType },
): Promise<SearchHit[]> {
  const term = input.query.trim()
  if (term.length < MIN_SEARCH_LENGTH) return []

  const ft = input.factoryType
  const needle = term.toLowerCase()
  const limit = PER_KIND

  const modules: SearchHit[] = NAV.filter((item) => canSee(item, ctx.roles, ft))
    .filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle) ||
        item.href.replace(/^\//, '').toLowerCase().includes(needle),
    )
    .slice(0, PER_KIND)
    .map((item) => ({
      kind: 'module' as const,
      id: item.id,
      title: item.label,
      subtitle: 'Module',
      href: item.href,
    }))

  // A module the caller cannot see is never asked. That is the access decision; the owner
  // still scopes its own read, so this is the cheap half of two independent checks.
  const [orders, buyerAccounts, leadRows, credits, samples, requisitions, udRows] =
    await Promise.all([
      maySee(ctx, ft, 'orders') ? searchOrders(ctx, { term, limit }) : [],
      maySee(ctx, ft, 'buyers') ? searchBuyers(ctx, { term, limit }) : [],
      maySee(ctx, ft, 'buyers') ? searchLeads(ctx, { term, limit }) : [],
      maySee(ctx, ft, 'lcs') ? searchLcs(ctx, { term, limit }) : [],
      maySee(ctx, ft, 'sampling') ? searchSampleRequests(ctx, { term, limit }) : [],
      maySee(ctx, ft, 'procurement') ? searchRequisitions(ctx, { term, limit }) : [],
      maySee(ctx, ft, 'ud') ? searchUds(ctx, { term, limit }) : [],
    ])

  const entities: SearchHit[] = [
    ...orders.map((row) => ({
      kind: 'order' as const,
      id: row.id,
      title: row.poNumber ?? row.id.slice(0, 8),
      subtitle: [row.buyerName, row.styleCode].filter(Boolean).join(' · ') || 'Order',
      href: `/orders/${row.id}`,
    })),
    ...buyerAccounts.map((row) => ({
      kind: 'buyer' as const,
      id: row.id,
      title: row.name,
      subtitle: row.country ? `Buyer · ${row.country}` : 'Buyer account',
      href: '/buyers',
    })),
    ...leadRows.map((row) => ({
      kind: 'lead' as const,
      id: row.id,
      title: row.companyName,
      subtitle: `Lead · ${row.stage}${row.country ? ` · ${row.country}` : ''}`,
      href: '/buyers',
    })),
    ...credits.map((row) => ({
      kind: 'lc' as const,
      id: row.id,
      title: row.number,
      subtitle: [row.buyerName, row.status].filter(Boolean).join(' · ') || 'Letter of credit',
      href: `/lcs/${row.id}`,
    })),
    ...samples.map((row) => ({
      kind: 'sample' as const,
      id: row.id,
      title: row.requestNo,
      subtitle: `${row.type.toUpperCase()} · ${row.styleCode} · ${row.status}`,
      href: `/sampling/${row.id}`,
    })),
    ...requisitions.map((row) => ({
      kind: 'requisition' as const,
      id: row.id,
      title: row.prNo,
      subtitle: row.neededBy ? `${row.status} · needed ${row.neededBy}` : String(row.status),
      href: `/procurement/${row.id}`,
    })),
    ...udRows.map((row) => ({
      kind: 'ud' as const,
      id: row.id,
      title: row.number,
      subtitle: `UD · ${row.status}`,
      href: `/ud/${row.id}`,
    })),
  ]

  return [...modules, ...entities]
}
