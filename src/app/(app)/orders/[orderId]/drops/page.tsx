import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { InlineAlert } from '@/components/fx/feedback'
import { SectionHeading } from '@/components/fx/signature'
import { StatusChip } from '@/components/fx/status-chip'
import { RouteHeader } from '@/components/shell/route-header'
import { OrderTabs } from '../order-tabs'
import { canWrite, NAV } from '@/components/shell/nav'
import { lcsForOrders } from '@/modules/commercial/queries'
import { getCtx } from '@/modules/core/session'
import { colourApprovals, dropsForOrder, orderDetail } from '@/modules/orders/queries'
import { companyProfile } from '@/modules/settings/service'
import { requestLocale } from '@/lib/ui-locale'

import { ColourChain, DropsEditor } from './drops-client'

/**
 * 1.3 Order Desk — drops and colours (HANDOFF: dossier additions).
 *
 * One PO, several departures: each drop carries its own latest-ship date and is
 * read against the credit ON ITS OWN — drop 1 clearing the LC while drop 2
 * breaches it is the normal case, and one drop failing does not block the other.
 * Below it, the colour chain the cloth order's conditions demand: lab dip → bulk
 * lot → shade band per colourway, the merchandiser's log of what the buyer
 * approved and when. Quality's 4-point verdict stays on quality's own screens.
 */
export const dynamic = 'force-dynamic'

export default async function DropsPage({
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

  const po = order.poNumbers[0] ?? order.id.slice(0, 8)
  const [drops, approvals, lcs] = await Promise.all([
    dropsForOrder(ctx, order.id),
    colourApprovals(ctx, order.id),
    lcsForOrders(ctx, [order.id]),
  ])

  const profile = await companyProfile(ctx)
  const mayWrite = canWrite(
    NAV.find((n) => n.id === 'orders')!,
    ctx.roles,
    profile?.factoryType ?? 'woven',
  )

  // The credit's latest-shipment date, read once — each drop is judged against it.
  const latestShipment = lcs
    .map((lc) => lc.latestShipmentDate)
    .filter((d): d is string => d !== null)
    .sort()[0]

  const colours = [...new Set(order.breakdown.map((cell) => cell.color))]
  const approvalsByColour = new Map<string, typeof approvals>()
  for (const row of approvals) {
    const held = approvalsByColour.get(row.color) ?? []
    held.push(row)
    approvalsByColour.set(row.color, held)
  }
  // A colour with recorded approvals but no breakdown cell still shows — the
  // approval may predate the grid revision that names it.
  for (const color of approvalsByColour.keys()) {
    if (!colours.includes(color)) colours.push(color)
  }

  const conflicted = drops.filter((d) => latestShipment && d.shipDate > latestShipment)
  const stalled = colours.filter((color) => {
    const chain = approvalsByColour.get(color) ?? []
    return !chain.some((c) => c.stage === 'shade_band' && c.status === 'approved')
  })

  return (
    <>
      <RouteHeader
        path={`/orders/${orderId}/drops`}
        labels={{ orderId: po }}
        locale={locale}
        eyebrow={order.buyerName ?? 'Order'}
        title="Drops and colours"
        meta={`${drops.length || 1} drop${drops.length === 1 || drops.length === 0 ? '' : 's'} · ${colours.length} colour${colours.length === 1 ? '' : 's'}`}
        ownsAmber
      />

      <OrderTabs orderId={orderId} active="drops" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, maxWidth: 900 }}>
        <section>
          <SectionHeading eyebrow="each departure is read against the credit on its own">
            Drops
          </SectionHeading>

          <div
            style={{
              background: 'var(--fx-bg-surface)',
              border: '1px solid var(--fx-border-subtle)',
              borderRadius: 'var(--fx-radius-md)',
              boxShadow: 'var(--fx-sh1)',
              padding: '8px 24px 20px',
            }}
          >
            {drops.length === 0 ? (
              <p
                style={{
                  font: '400 14px/1.6 var(--fx-font-sans)',
                  color: 'var(--fx-text-secondary)',
                }}
              >
                One departure — the whole quantity ships on{' '}
                {order.plannedExFactoryDate ?? 'a date still to be set'}. Split it when the buyer
                orders drops.
              </p>
            ) : (
              drops.map((drop, i) => {
                const conflict = latestShipment !== undefined && drop.shipDate > latestShipment
                return (
                  <div
                    key={drop.dropNo}
                    className="fx-selvage"
                    data-status={conflict ? 'late' : 'on-track'}
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)' }}
                  >
                    <div
                      style={{
                        flex: 1,
                        padding: '13px 0 13px 14px',
                        display: 'flex',
                        gap: 16,
                        alignItems: 'baseline',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ font: '500 14px/1.3 var(--fx-font-sans)', minWidth: 64 }}>
                        Drop {drop.dropNo}
                      </span>
                      <span data-numeric data-mono style={{ font: '400 13.5px/1.3 var(--fx-font-mono)' }}>
                        {drop.qty.toLocaleString()} pcs
                      </span>
                      <span data-numeric data-mono style={{ font: '400 13.5px/1.3 var(--fx-font-mono)' }}>
                        ship by {drop.shipDate}
                      </span>
                      {drop.note ? (
                        <span
                          style={{
                            font: '400 13px/1.4 var(--fx-font-sans)',
                            color: 'var(--fx-text-secondary)',
                          }}
                        >
                          {drop.note}
                        </span>
                      ) : null}
                      <span style={{ marginLeft: 'auto' }}>
                        <StatusChip status={conflict ? 'late' : 'on-track'}>
                          {conflict
                            ? `after the credit's ${latestShipment}`
                            : latestShipment
                              ? 'inside the credit'
                              : 'no credit linked'}
                        </StatusChip>
                      </span>
                    </div>
                  </div>
                )
              })
            )}

            {conflicted.length > 0 ? (
              <div style={{ paddingTop: 14 }}>
                <InlineAlert tone="danger">
                  {conflicted.length === 1 ? 'One drop ships' : `${conflicted.length} drops ship`}{' '}
                  after the credit&rsquo;s latest shipment of {latestShipment}. Move those drops, or
                  ask commercial for an amendment — one drop failing does not block the others.
                </InlineAlert>
              </div>
            ) : null}

            <div style={{ paddingTop: 14 }}>
              <DropsEditor orderId={order.id} drops={drops} canWrite={mayWrite} />
            </div>
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow={
              stalled.length > 0
                ? `${stalled.length} colour${stalled.length === 1 ? '' : 's'} without an approved shade band`
                : 'every colourway cleared'
            }
          >
            Colour approvals
          </SectionHeading>

          <div
            style={{
              background: 'var(--fx-bg-surface)',
              border: '1px solid var(--fx-border-subtle)',
              borderRadius: 'var(--fx-radius-md)',
              boxShadow: 'var(--fx-sh1)',
              padding: '8px 24px 20px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {colours.length === 0 ? (
              <p style={{ font: '400 14px/1.6 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}>
                Colours appear here with the size breakdown — the chain is per colourway.
              </p>
            ) : (
              colours.map((color, i) => (
                <div
                  key={color}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '14px 0',
                    borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)',
                  }}
                >
                  <span style={{ font: '600 14px/1.3 var(--fx-font-sans)' }}>{color}</span>
                  <ColourChain
                    orderId={order.id}
                    color={color}
                    cells={approvalsByColour.get(color) ?? []}
                    canWrite={mayWrite}
                  />
                </div>
              ))
            )}

            <div
              style={{
                borderTop: '1px solid var(--fx-border-subtle)',
                paddingTop: 12,
                font: '400 12px/1.5 var(--fx-font-sans)',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              This is the buyer&rsquo;s chain — what they approved and when. The 4-point fabric
              verdict is quality&rsquo;s, on their own screens, and the store&rsquo;s shade gate
              refuses a mixed issue regardless of what is recorded here.
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
