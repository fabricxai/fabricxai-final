import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { outstandingRequisitions, rollsForItem, type RollRow } from '@/modules/store/queries'
import { getStock } from '@/modules/store/service'

import { IssueClient } from './issue-client'

/**
 * 3.1 Store · issue to production (canvas P3).
 *
 * The screen exists for two things a storekeeper cannot see from a number on a shelf:
 *
 *  - **Free, not on hand.** On-hand includes cloth already promised to another order.
 *    Issuing against it is how two cutting tables are sent the same roll, so the running
 *    total here is always against free.
 *  - **Shade.** Rolls carry a dye lot. Two lots in one lay is a garment that leaves with
 *    two different navies in it, found by the buyer rather than by the store — so picking
 *    across shade groups warns before the lay is spread, not after.
 *
 * Rolls are loaded per outstanding item rather than for the whole store: a storekeeper
 * issuing poplin has no use for a list of every button in the building.
 */
export const dynamic = 'force-dynamic'

export default async function StoreIssuePage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const outstanding = await outstandingRequisitions(ctx)

  if (outstanding.length === 0) {
    return (
      <FloorScreen>
        <PageHeader eyebrow="Store · issue to production" title="Nothing outstanding" ownsAmber />
        <EmptyState
          title="No requisition is waiting on the store"
          body="An issue is made against a requisition, never against an order directly — that is what stops a cutting table taking another order's cloth. When merchandising sizes an order, its lines appear here."
        />
      </FloorScreen>
    )
  }

  const itemIds = [...new Set(outstanding.map((line) => line.itemId))]
  const [stock, rollLists] = await Promise.all([
    getStock(ctx, { itemIds }),
    Promise.all(itemIds.map((id) => rollsForItem(ctx, id))),
  ])

  const rollsByItem: Record<string, RollRow[]> = {}
  itemIds.forEach((id, i) => {
    // Only what is actually in the store. An issued roll is on the floor already, and a
    // pick list that offers it is a pick list somebody will act on.
    rollsByItem[id] = (rollLists[i] ?? []).filter((roll) => roll.status === 'in_stock')
  })

  const freeByItem: Record<string, string> = {}
  const onHandByItem: Record<string, string> = {}
  for (const id of itemIds) {
    freeByItem[id] = stock.get(id)?.free ?? '0'
    onHandByItem[id] = stock.get(id)?.onHand ?? '0'
  }

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="Store · issue to production"
        title={`${outstanding.length} line${outstanding.length === 1 ? '' : 's'} to issue`}
        meta="issue against free, never against on hand"
        ownsAmber
      />
      <IssueClient
        lines={outstanding}
        rollsByItem={rollsByItem}
        freeByItem={freeByItem}
        onHandByItem={onHandByItem}
      />
    </FloorScreen>
  )
}
