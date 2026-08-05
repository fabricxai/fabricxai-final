import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { Card } from '@/components/fx/data'
import { Badge } from '@/components/fx/primitives'
import { RunRateCard } from '@/components/fx/run-rate'
import { SectionHeading } from '@/components/fx/signature'
import { BreakdownGrid, FactPair, MilestoneTimeline } from '@/components/fx/tna'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { orderDetail } from '@/modules/orders/queries'
import { orderRunRate } from '@/modules/production/queries'

/**
 * 1.3 Order Desk — one order.
 *
 * The TNA and the breakdown are the two things a merchandiser opens this screen
 * for, so both are on the page rather than behind tabs. What IS behind a tab is
 * everything that belongs to another module — the LC, the documents — because
 * those are read across a boundary and owned elsewhere.
 */
export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const { orderId } = await params
  const order = await orderDetail(ctx, orderId)
  if (!order) notFound()

  const po = order.poNumbers[0] ?? order.id.slice(0, 8)
  const late = order.milestones.filter((m) => m.status === 'late').length

  // The run rate is only meaningful once there is a quantity to burn down against. An order
  // with no contracted quantity is still being negotiated, and a card that reads "completes
  // never" on it is noise on a screen a merchandiser lives in.
  const contractedQty = order.style?.contractedQty ?? null
  const forecast = contractedQty
    ? await orderRunRate(ctx, {
        orderId: order.id,
        contractedQty,
        asOf: new Date().toISOString().slice(0, 10),
        milestoneDate:
          order.milestones.find((m) => m.name === 'sewing_end')?.plannedDate ?? null,
      })
    : null

  return (
    <>
      <PageHeader
        back={{ href: '/orders', label: 'Order desk' }}
        eyebrow={order.buyerName ?? 'Order'}
        title={po}
        meta={order.plannedExFactoryDate ? `ship ${order.plannedExFactoryDate}` : undefined}
        // The header thread rule IS this view's amber moment, so nothing below
        // it takes an amber fill.
        ownsAmber
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <Card>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <FactPair label="Style">
              {order.style?.styleCode ?? '—'}
              {order.style?.description ? (
                <span style={{ color: 'var(--fx-text-tertiary)', fontWeight: 400 }}>
                  {' '}
                  · {order.style.description}
                </span>
              ) : null}
            </FactPair>
            <FactPair label="Contracted">
              <span data-numeric>{order.style?.contractedQty?.toLocaleString() ?? '—'} pcs</span>
            </FactPair>
            <FactPair label="Unit price">
              <span data-numeric data-mono>
                {order.style?.unitPrice
                  ? `${order.style.unitPrice} ${order.style.currency}`
                  : '—'}
              </span>
            </FactPair>
            <FactPair label="Order value">
              <span data-numeric data-mono>
                {order.totalValue ? `${order.totalValue} ${order.currency}` : '—'}
              </span>
            </FactPair>
            <FactPair label="Status">
              <Badge tone={late > 0 ? 'danger' : 'neutral'}>{order.status}</Badge>
            </FactPair>
          </div>
        </Card>

        {forecast ? (
          <section>
            <SectionHeading eyebrow="read-only · a window into the sewing floor">
              Where production has got to
            </SectionHeading>
            <RunRateCard forecast={forecast} />
          </section>
        ) : null}

        <section>
          <SectionHeading eyebrow={late > 0 ? `${late} late` : undefined}>
            Time and action
          </SectionHeading>
          <MilestoneTimeline milestones={order.milestones} />
        </section>

        <section>
          <SectionHeading
            eyebrow={order.style ? `revision ${order.style.activeRevision}` : undefined}
          >
            Size breakdown
          </SectionHeading>
          <BreakdownGrid
            cells={order.breakdown}
            contractedQty={order.style?.contractedQty}
            tolerancePct={order.qtyTolerancePct}
          />
        </section>
      </div>
    </>
  )
}
