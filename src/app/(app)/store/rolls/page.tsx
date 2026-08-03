import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { rollsForItem, stockOnHand, type RollRow } from '@/modules/store/queries'

import { RollsClient } from './rolls-client'

/**
 * 3.1 Store · rolls and lots (canvas P2).
 *
 * The drill-down behind a stock line. A storekeeper standing at the rack needs the roll,
 * its dye lot and where it sits — not a total — and this is also the only place a count
 * can be corrected, which is why the correction drafts rather than writes.
 */
export const dynamic = 'force-dynamic'

export default async function StoreRollsPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const stock = await stockOnHand(ctx)

  if (stock.length === 0) {
    return (
      <FloorScreen>
        <PageHeader eyebrow="Store · rolls and lots" title="Nothing in stock" ownsAmber />
        <EmptyState
          title="No rolls to show"
          body="Rolls appear here once goods are received. Every quantity in the store is derived from them."
        />
      </FloorScreen>
    )
  }

  const requested = (await searchParams).item
  const selected = stock.find((s) => s.itemId === requested) ?? stock[0]!
  const rolls: RollRow[] = await rollsForItem(ctx, selected.itemId)

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="Store · rolls and lots"
        title={selected.name}
        meta={`${rolls.length} roll${rolls.length === 1 ? '' : 's'} · ${selected.onHand} ${selected.unit} on hand`}
        ownsAmber
      />
      <RollsClient
        items={stock.map((s) => ({
          itemId: s.itemId,
          code: s.code,
          name: s.name,
          onHand: s.onHand,
          unit: s.unit,
          rollCount: s.rollCount,
        }))}
        selectedItemId={selected.itemId}
        rolls={rolls}
      />
    </FloorScreen>
  )
}
