import { eq, ilike, or, sql } from 'drizzle-orm'

import { canSee, NAV, type FactoryType } from '@/components/shell/nav'
import { buyers, leads } from '@/modules/buyers/schema'
import { lcs, uds } from '@/modules/commercial/schema'
import type { AnyCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'
import { orderStyles, orders } from '@/modules/orders/schema'
import { purchaseRequisitions } from '@/modules/procurement/schema'
import { sampleRequests } from '@/modules/sampling/schema'

import type { SearchHit } from './search-types'

export type { SearchHit, SearchHitKind } from './search-types'

/**
 * Shell command search — jump to a module, or to a record the caller's role may open.
 *
 * Every hit is gated the same way the sidebar is: if `canSee` would hide the module,
 * this returns nothing for that kind. Tenancy is the second wall (`withTenantRead`).
 * There is no global FTS index yet; ILIKE / array text match is enough for the bar.
 */

const PER_KIND = 5

function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, '\\$&')
}

function pattern(raw: string): string {
  return `%${escapeLike(raw.trim())}%`
}

function maySee(ctx: AnyCtx, factoryType: FactoryType, id: string): boolean {
  const item = NAV.find((entry) => entry.id === id)
  return item ? canSee(item, ctx.roles, factoryType) : false
}

export async function searchFactory(
  ctx: AnyCtx,
  input: { query: string; factoryType: FactoryType },
): Promise<SearchHit[]> {
  const q = input.query.trim()
  if (q.length < 1) return []

  const ft = input.factoryType
  const like = pattern(q)
  const needle = q.toLowerCase()

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

  const may = {
    orders: maySee(ctx, ft, 'orders'),
    buyers: maySee(ctx, ft, 'buyers'),
    lcs: maySee(ctx, ft, 'lcs'),
    sampling: maySee(ctx, ft, 'sampling'),
    procurement: maySee(ctx, ft, 'procurement'),
    ud: maySee(ctx, ft, 'ud'),
  }

  const entities = await withTenantRead(ctx, async (tx) => {
    const hits: SearchHit[] = []

    if (may.orders) {
      const rows = await tx
        .select({
          id: orders.id,
          poNumbers: orders.poNumbers,
          buyerName: buyers.name,
          styleCode: orderStyles.styleCode,
        })
        .from(orders)
        .leftJoin(buyers, eq(buyers.id, orders.buyerId))
        .leftJoin(orderStyles, eq(orderStyles.orderId, orders.id))
        .where(
          or(
            sql`${orders.poNumbers}::text ilike ${like} escape '\\'`,
            ilike(buyers.name, like),
            ilike(orderStyles.styleCode, like),
          ),
        )
        .limit(PER_KIND * 2)

      const seen = new Set<string>()
      for (const row of rows) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        const po = (row.poNumbers ?? [])[0] ?? row.id.slice(0, 8)
        hits.push({
          kind: 'order',
          id: row.id,
          title: po,
          subtitle: [row.buyerName, row.styleCode].filter(Boolean).join(' · ') || 'Order',
          href: `/orders/${row.id}`,
        })
        if (seen.size >= PER_KIND) break
      }
    }

    if (may.buyers) {
      const buyerRows = await tx
        .select({ id: buyers.id, name: buyers.name, country: buyers.country })
        .from(buyers)
        .where(or(ilike(buyers.name, like), ilike(buyers.country, like)))
        .limit(PER_KIND)

      for (const row of buyerRows) {
        hits.push({
          kind: 'buyer',
          id: row.id,
          title: row.name,
          subtitle: row.country ? `Buyer · ${row.country}` : 'Buyer account',
          href: '/buyers',
        })
      }

      const leadRows = await tx
        .select({
          id: leads.id,
          companyName: leads.companyName,
          stage: leads.stage,
          country: leads.country,
        })
        .from(leads)
        .where(or(ilike(leads.companyName, like), ilike(leads.country, like)))
        .limit(PER_KIND)

      for (const row of leadRows) {
        hits.push({
          kind: 'lead',
          id: row.id,
          title: row.companyName,
          subtitle: `Lead · ${row.stage}${row.country ? ` · ${row.country}` : ''}`,
          href: '/buyers',
        })
      }
    }

    if (may.lcs) {
      const rows = await tx
        .select({
          id: lcs.id,
          number: lcs.number,
          status: lcs.status,
          buyerName: buyers.name,
        })
        .from(lcs)
        .leftJoin(buyers, eq(buyers.id, lcs.buyerId))
        .where(or(ilike(lcs.number, like), ilike(buyers.name, like)))
        .limit(PER_KIND)

      for (const row of rows) {
        hits.push({
          kind: 'lc',
          id: row.id,
          title: row.number,
          subtitle: [row.buyerName, row.status].filter(Boolean).join(' · ') || 'Letter of credit',
          href: `/lcs/${row.id}`,
        })
      }
    }

    if (may.sampling) {
      const rows = await tx
        .select({
          id: sampleRequests.id,
          requestNo: sampleRequests.requestNo,
          styleCode: sampleRequests.styleCode,
          type: sampleRequests.type,
          status: sampleRequests.status,
        })
        .from(sampleRequests)
        .where(or(ilike(sampleRequests.requestNo, like), ilike(sampleRequests.styleCode, like)))
        .limit(PER_KIND)

      for (const row of rows) {
        hits.push({
          kind: 'sample',
          id: row.id,
          title: row.requestNo,
          subtitle: `${row.type.toUpperCase()} · ${row.styleCode} · ${row.status}`,
          href: `/sampling/${row.id}`,
        })
      }
    }

    if (may.procurement) {
      const rows = await tx
        .select({
          id: purchaseRequisitions.id,
          prNo: purchaseRequisitions.prNo,
          status: purchaseRequisitions.status,
          neededBy: purchaseRequisitions.neededBy,
        })
        .from(purchaseRequisitions)
        .where(ilike(purchaseRequisitions.prNo, like))
        .limit(PER_KIND)

      for (const row of rows) {
        hits.push({
          kind: 'requisition',
          id: row.id,
          title: row.prNo,
          subtitle: row.neededBy
            ? `${row.status} · needed ${row.neededBy}`
            : String(row.status),
          href: `/procurement/${row.id}`,
        })
      }
    }

    if (may.ud) {
      const rows = await tx
        .select({ id: uds.id, number: uds.number, status: uds.status })
        .from(uds)
        .where(ilike(uds.number, like))
        .limit(PER_KIND)

      for (const row of rows) {
        hits.push({
          kind: 'ud',
          id: row.id,
          title: row.number,
          subtitle: `UD · ${row.status}`,
          href: `/ud/${row.id}`,
        })
      }
    }

    return hits
  })

  return [...modules, ...entities]
}
