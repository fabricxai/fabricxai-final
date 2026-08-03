import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { FloorScreen } from '@/components/fx/floor'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { itemList } from '@/modules/store/queries'
import { locations } from '@/modules/store/schema'
import { withTenantRead } from '@/modules/core/tenancy'

import { ReceiveClient } from './receive-client'

/**
 * 3.1 Store · receive goods (canvas P1).
 *
 * A GRN is a record of a physical event — cloth arrived, and a storekeeper standing at the
 * rack saw it. So the write goes through the offline batch endpoint with a device key, not
 * a server action: the delivery bay is where the wifi is worst, and a receipt that fails
 * because the network did is a receipt somebody re-enters from memory.
 *
 * **Why the challan photo does not draft.** The canvas shows `marbim.extractChallan` making
 * a pending change. `store/register.ts` deliberately keeps `grns` OUT of `pendingTargets`,
 * arguing that a receipt is a physical event and belongs to the person who witnessed it
 * rather than to a model's reading of a document. Both are right about the thing they care
 * about, and the resolution is the same one the propose→approve loop exists for: the photo
 * is attached and its fields PRE-FILL this form, the storekeeper confirms what is on the
 * paper in their hand, and the confirmed receipt is what gets written. A model never writes
 * a GRN, and no receipt waits in a queue while cloth sits in the bay.
 */
export const dynamic = 'force-dynamic'

export default async function StoreReceivePage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const [items, locationRows] = await Promise.all([
    itemList(ctx),
    withTenantRead(ctx, (tx) =>
      tx
        .select({ id: locations.id, code: locations.code, name: locations.name, kind: locations.kind })
        .from(locations),
    ),
  ])

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="Store · receive goods"
        title="Receive against a challan"
        meta="one GRN per challan · rolls counted at the rack"
        ownsAmber
      />
      <ReceiveClient items={items} locations={locationRows} />
    </FloorScreen>
  )
}
