import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { PageHeader } from '@/components/shell/page-shell'
import { checkPpApprovalFor } from '@/modules/sampling/service'
import { cuttableOrders, issuedRollsForOrder } from '@/modules/cutting/queries'
import { markers } from '@/modules/cutting/schema'
import { getCtx } from '@/modules/core/session'
import { withTenantRead } from '@/modules/core/tenancy'
import { eq } from 'drizzle-orm'

import { LayClient } from './lay-client'

/**
 * 5.1 Cutting · start a lay (canvas P2).
 *
 * Both gates are evaluated HERE as well as in `createLay`, and that is not duplication —
 * they answer different questions. The service's check is the wall: it refuses the write.
 * This one is the sign on the door: it tells a cutter *before* they measure and pick rolls
 * that this style cannot be spread yet, and says which gate is holding it.
 *
 * A cutter who gets that answer after choosing has already moved fabric.
 */
export const dynamic = 'force-dynamic'

export default async function StartLayPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const orders = await cuttableOrders(ctx)

  if (orders.length === 0) {
    return (
      <FloorScreen>
        <PageHeader eyebrow="Cutting · start a lay" title="Nothing to cut" ownsAmber />
        <EmptyState
          title="No confirmed order is waiting on cutting"
          body="An order reaches the cutting floor once it is confirmed and in production."
        />
      </FloorScreen>
    )
  }

  const requested = (await searchParams).order
  const target = orders.find((o) => o.orderId === requested) ?? orders[0]!

  const [gate, rolls, markerRows] = await Promise.all([
    checkPpApprovalFor(ctx, { orderId: target.orderId, orderStyleId: target.orderStyleId }),
    issuedRollsForOrder(ctx, target.orderId),
    withTenantRead(ctx, (tx) =>
      tx
        .select({
          id: markers.id,
          code: markers.code,
          sizeRatio: markers.sizeRatio,
          layLengthMeters: markers.layLengthMeters,
          efficiencyPct: markers.efficiencyPct,
          fabricWidthInches: markers.fabricWidthInches,
        })
        .from(markers)
        .where(eq(markers.styleCode, target.styleCode)),
    ),
  ])

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="Cutting · start a lay"
        title={`${target.poNumber ?? 'Order'} · ${target.styleCode}`}
        meta={gate.passed ? undefined : 'blocked'}
        ownsAmber
      />

      {!gate.passed ? (
        <InlineAlert tone="danger">
          This style cannot be spread yet — the PP gate is holding it
          {gate.reasonKey ? ` (${gate.reasonKey})` : ''}. The buyer signs off one garment
          before the factory makes eighty thousand. Nothing below will be accepted until
          that approval is recorded in the sample room.
        </InlineAlert>
      ) : null}

      <LayClient
        orders={orders}
        target={target}
        markers={markerRows}
        rolls={rolls}
        blocked={!gate.passed}
      />
    </FloorScreen>
  )
}
