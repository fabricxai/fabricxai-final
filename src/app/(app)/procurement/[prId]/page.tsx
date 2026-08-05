import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { PageHeader } from '@/components/shell/page-shell'
import { btbLcs, lcs } from '@/modules/commercial/schema'
import { getCtx } from '@/modules/core/session'
import { withTenantRead } from '@/modules/core/tenancy'
import {
  purchaseRequisitionLines,
  purchaseRequisitions,
  suppliers,
} from '@/modules/procurement/schema'
import { compareQuotesForItem } from '@/modules/procurement/service'
import { items } from '@/modules/store/schema'
import { actionErrorMessage } from '@/lib/action-error'

import { RequisitionClient } from './requisition-client'

/**
 * 3.2 Procurement · one requisition (canvas P2).
 *
 * Where a factory decides who to buy from, and the screen is built around the two ways that
 * decision is normally got wrong.
 *
 * **Landed cost, not unit price.** A mill quoting 2.42 against one quoting 2.91 looks
 * cheaper until duty and freight are added; the comparison ranks on what the fabric costs
 * when it reaches the store, which is the only number that buys anything.
 *
 * **Infeasible is not "last".** A quote whose lead time lands after the fabric is needed is
 * separated out rather than ranked, because a list that puts it at the bottom is a list
 * somebody eventually picks from the bottom.
 *
 * The cheapest is highlighted and never pre-selected — choosing a supplier weighs quality
 * history and a relationship this screen cannot see.
 */
export const dynamic = 'force-dynamic'

export default async function RequisitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ prId: string }>
  searchParams: Promise<{ rate?: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const { prId } = await params

  const [pr] = await withTenantRead(ctx, (tx) =>
    tx
      .select({
        id: purchaseRequisitions.id,
        prNo: purchaseRequisitions.prNo,
        neededBy: purchaseRequisitions.neededBy,
        status: purchaseRequisitions.status,
      })
      .from(purchaseRequisitions)
      .where(eq(purchaseRequisitions.id, prId)),
  )
  if (!pr) notFound()

  const [lines, supplierRows, btbRows] = await Promise.all([
    withTenantRead(ctx, (tx) =>
      tx
        .select({
          itemId: purchaseRequisitionLines.itemId,
          qty: purchaseRequisitionLines.qty,
          unit: purchaseRequisitionLines.unit,
          itemName: items.name,
        })
        .from(purchaseRequisitionLines)
        .innerJoin(items, eq(items.id, purchaseRequisitionLines.itemId))
        .where(eq(purchaseRequisitionLines.purchaseRequisitionId, prId)),
    ),
    withTenantRead(ctx, (tx) =>
      tx
        .select({
          id: suppliers.id,
          code: suppliers.code,
          name: suppliers.name,
          origin: suppliers.origin,
          currency: suppliers.defaultCurrency,
        })
        .from(suppliers)
        .where(eq(suppliers.isActive, true)),
    ),
    // Back-to-back credits an import PO can be funded from. Only these — a PO cannot draw
    // on a master LC directly, and offering one would produce a gate refusal at issue.
    withTenantRead(ctx, (tx) =>
      tx
        .select({
          id: btbLcs.id,
          number: btbLcs.number,
          value: btbLcs.value,
          currency: btbLcs.currency,
          masterNumber: lcs.number,
        })
        .from(btbLcs)
        .innerJoin(lcs, eq(lcs.id, btbLcs.masterLcId))
        .where(eq(btbLcs.status, 'active')),
    ),
  ])

  // Quotes arrive in the currency each supplier works in, and comparing across currencies
  // needs a stated rate — the service refuses without one, for the same reason a cost sheet
  // carries its own FX rate rather than looking one up. A rate fetched silently at render
  // time is a decision nobody can reconstruct six months later.
  const { rate } = await searchParams
  const rates = rate ? { BDT: rate } : undefined

  const comparisons = await Promise.all(
    lines.map(async (line) => {
      try {
        return {
          itemId: line.itemId,
          itemName: line.itemName,
          qty: line.qty,
          unit: line.unit,
          comparison: await compareQuotesForItem(ctx, {
            purchaseRequisitionId: prId,
            itemId: line.itemId,
            baseCurrency: 'USD',
            ...(rates ? { rates } : {}),
          }),
          problem: null as string | null,
        }
      } catch (error) {
        // Surfaced rather than swallowed. A blank comparison panel tells a buyer nothing;
        // "these quotes are in two currencies and nobody has stated a rate" tells them
        // exactly what to do next.
        return {
          itemId: line.itemId,
          itemName: line.itemName,
          qty: line.qty,
          unit: line.unit,
          comparison: null,
          problem: actionErrorMessage(error, 'the comparison could not be computed'),
        }
      }
    }),
  )

  return (
    <>
      <PageHeader
        back={{ href: '/procurement', label: 'Procurement' }}
        eyebrow="Procurement · requisition"
        title={pr.prNo}
        meta={pr.neededBy ? `needed by ${pr.neededBy} · ${pr.status}` : String(pr.status)}
        ownsAmber
      />

      <RequisitionClient
        prId={prId}
        prNo={pr.prNo}
        lines={comparisons}
        rate={rate ?? null}
        suppliers={supplierRows}
        btbs={btbRows}
      />
    </>
  )
}
