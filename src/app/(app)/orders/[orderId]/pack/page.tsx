import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { InlineAlert } from '@/components/fx/feedback'
import { SectionHeading } from '@/components/fx/signature'
import { RouteHeader } from '@/components/shell/route-header'
import { OrderTabs } from '../order-tabs'
import { getCtx } from '@/modules/core/session'
import { orderDetail } from '@/modules/orders/queries'
import { sewnAgainstOrder } from '@/modules/production/queries'
import { shipmentBoard } from '@/modules/shipment/queries'
import { remainingToPackFor } from '@/modules/shipment/service'
import { factoryToday } from '@/lib/dates'
import { requestLocale } from '@/lib/ui-locale'

import { CopyPack } from './pack-copy'

/**
 * 1.3 Order Desk — the buyer status pack.
 *
 * "Where is my order?" is answered by mail every day, retyped from the daily
 * production report. This page composes the answer once — quantities, dates, an
 * honest confidence word — and hands it over as text to paste.
 *
 * The one rule that makes it safe to send: NO MONEY. Not redacted-by-role — absent
 * by construction. The buyer sees quantities, dates and quality; the CM, the value
 * and the margin never enter this page's data at all, so no future edit can leak
 * what was never fetched.
 */
export const dynamic = 'force-dynamic'

const sumCells = (cells: Record<string, number>): number =>
  Object.values(cells).reduce((pieces, n) => pieces + n, 0)

const CONFIDENCE_WORDS: Record<string, string> = {
  ok: 'on track',
  risk: 'at risk',
  late: 'running late',
  done: 'complete',
}

export default async function BuyerPackPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const { orderId } = await params
  const locale = await requestLocale()
  const order = await orderDetail(ctx, orderId)
  if (!order) notFound()

  const today = factoryToday()
  const po = order.poNumbers[0] ?? order.id.slice(0, 8)

  const [cells, sewn, shipments] = await Promise.all([
    remainingToPackFor(ctx, { orderId: order.id }),
    sewnAgainstOrder(ctx, order.id),
    shipmentBoard(ctx),
  ])

  const ordered = sumCells(cells.ordered) || (order.style?.contractedQty ?? 0)
  const finished = sumCells(cells.finished)
  const packed = sumCells(cells.packed)
  const mine = shipments.filter((s) => s.orderId === order.id)
  const shipped = mine
    .filter((s) => s.actualExFactory !== null)
    .reduce((pieces, s) => pieces + (s.packedQty ?? 0), 0)

  const pp = order.milestones.find((m) => m.name === 'pp_approval')
  const confidence = CONFIDENCE_WORDS[order.health] ?? order.health
  const headline =
    order.health === 'late' || order.health === 'risk'
      ? (order.milestones.find((m) => m.status === 'late') ??
          order.milestones.find((m) => m.status === 'at_risk'))
      : undefined

  const pct = (n: number): string => (ordered > 0 ? ` (${Math.round((n / ordered) * 100)}%)` : '')

  const lines = [
    `Status — ${po} · ${order.style?.styleCode ?? ''}`.trim(),
    `As of ${today}`,
    '',
    'Where the order stands',
    `  Ordered            ${ordered.toLocaleString()} pcs`,
    `  Sewn               ${sewn.toLocaleString()} pcs${pct(sewn)}`,
    `  Finished           ${finished.toLocaleString()} pcs${pct(finished)}`,
    `  Packed             ${packed.toLocaleString()} pcs${pct(packed)}`,
    `  Shipped            ${shipped.toLocaleString()} pcs${pct(shipped)}`,
    '',
    'Dates',
    ...(pp
      ? [
          `  PP sample          ${pp.actualDate ? `approved ${pp.actualDate}` : `planned ${pp.plannedDate ?? '—'}`}`,
        ]
      : []),
    `  Ex-factory         ${order.plannedExFactoryDate ?? 'to be confirmed'}`,
    `  Our reading        ${confidence}${headline ? ` — ${headline.name.replace(/_/g, ' ')}` : ''}`,
  ].join('\n')

  return (
    <>
      <RouteHeader
        path={`/orders/${orderId}/pack`}
        labels={{ orderId: po }}
        locale={locale}
        eyebrow={order.buyerName ?? 'Order'}
        title="Buyer status pack"
        meta={`as of ${today}`}
        ownsAmber
      />

      <OrderTabs orderId={orderId} active="pack" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 720 }}>
        <InlineAlert tone="info">
          Costs and CM are not in this pack — not hidden, never fetched. The buyer sees
          quantities, dates and our honest reading, nothing else.
        </InlineAlert>

        <section>
          <SectionHeading eyebrow="what the buyer will see">The pack</SectionHeading>
          <pre
            style={{
              margin: 0,
              background: 'var(--fx-bg-surface)',
              border: '1px solid var(--fx-border-subtle)',
              borderRadius: 'var(--fx-radius-md)',
              padding: '20px 24px',
              font: '400 13px/1.7 var(--fx-font-mono)',
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
            }}
          >
            {lines}
          </pre>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <CopyPack text={lines} />
          <span style={{ font: '400 12.5px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
            Figures come from the floor&rsquo;s own records as of the last report — nothing here
            is typed twice.
          </span>
        </div>
      </div>
    </>
  )
}
