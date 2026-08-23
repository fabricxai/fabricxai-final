import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { type SelvageStatus } from '@/components/fx/signature'
import { StatusChip } from '@/components/fx/status-chip'
import { RouteHeader } from '@/components/shell/route-header'
import { OrderTabs } from '../order-tabs'
import { canWrite, NAV } from '@/components/shell/nav'
import { getCtx } from '@/modules/core/session'
import { fabricLegs } from '@/modules/orders/queries'
import { orderDetail } from '@/modules/orders/queries'
import { companyProfile } from '@/modules/settings/service'
import { factoryToday } from '@/lib/dates'
import { translator, type Translator } from '@/lib/i18n-ui'
import { requestLocale } from '@/lib/ui-locale'

import { LegEditor } from './leg-editor'

/**
 * 1.3 Order Desk — where the fabric is (HANDOFF: dossier additions).
 *
 * The confirmation sheet's FABRICS ETD / ETA / INHOUSE PLAN columns as a screen:
 * seven legs from booking to the store, each with plan against actual, so when the
 * fabric slips the trail says WHERE — the mill, the vessel, the port, customs — and
 * therefore who is chased and whether the booking's late-delivery terms are worth
 * raising with commercial. The store's GRN stays the truth of in-house; this page
 * records the chase, never the stock.
 */
export const dynamic = 'force-dynamic'

const LEG_KEYS: Record<string, string> = {
  booking_placed: 'ui.fabriclegs.leg_booking_placed',
  pi_received: 'ui.fabriclegs.leg_pi_received',
  ex_mill: 'ui.fabriclegs.leg_ex_mill',
  on_vessel: 'ui.fabriclegs.leg_on_vessel',
  at_port: 'ui.fabriclegs.leg_at_port',
  customs_cleared: 'ui.fabriclegs.leg_customs_cleared',
  in_house: 'ui.fabriclegs.leg_in_house',
}

function legStatus(
  cell: { planDate: string | null; actualDate: string | null },
  today: string,
  t: Translator,
): { selvage: SelvageStatus; word: string; overdue: boolean } {
  if (cell.actualDate) {
    const late = cell.planDate !== null && cell.actualDate > cell.planDate
    return {
      selvage: late ? 'late' : 'on-track',
      word: late ? t('ui.fabriclegs.word_late') : t('ui.fabriclegs.word_done'),
      overdue: false,
    }
  }
  if (cell.planDate && cell.planDate < today) {
    return { selvage: 'late', word: t('ui.fabriclegs.word_overdue'), overdue: true }
  }
  if (cell.planDate) {
    return { selvage: 'on-track', word: t('ui.fabriclegs.word_planned'), overdue: false }
  }
  return { selvage: 'on-track', word: '—', overdue: false }
}

export default async function FabricLegsPage({
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

  const t = translator(locale)
  const today = factoryToday()
  const legs = await fabricLegs(ctx, order.id)
  const po = order.poNumbers[0] ?? order.id.slice(0, 8)

  const profile = await companyProfile(ctx)
  const mayWrite = canWrite(
    NAV.find((n) => n.id === 'orders')!,
    ctx.roles,
    profile?.factoryType ?? 'woven',
  )

  const slipped = legs.filter(
    (leg) => legStatus(leg, today, t).selvage === 'late',
  ).length

  return (
    <>
      <RouteHeader
        path={`/orders/${orderId}/fabric`}
        labels={{ orderId: po }}
        locale={locale}
        eyebrow={order.buyerName ?? 'Order'}
        title={t('ui.fabriclegs.title')}
        meta={slipped > 0 ? t.plural('ui.fabriclegs.meta_late', slipped) : undefined}
        ownsAmber
      />

      <OrderTabs orderId={orderId} active="fabric" />

      <div
        style={{
          background: 'var(--fx-bg-surface)',
          border: '1px solid var(--fx-border-subtle)',
          borderRadius: 'var(--fx-radius-md)',
          boxShadow: 'var(--fx-sh1)',
          padding: '8px 24px 20px',
          maxWidth: 860,
        }}
      >
        {legs.map((leg, i) => {
          const status = legStatus(leg, today, t)
          return (
            <div
              key={leg.leg}
              className="fx-selvage"
              data-status={status.selvage}
              style={{
                borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)',
              }}
            >
              <div
                style={{
                  flex: 1,
                  padding: '13px 0 13px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ font: '500 14.5px/1.3 var(--fx-font-sans)', minWidth: 190 }}>
                    {LEG_KEYS[leg.leg] ? t(LEG_KEYS[leg.leg]!) : leg.leg}
                  </span>
                  <span
                    data-numeric
                    data-mono
                    style={{ font: '400 13px/1.3 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}
                  >
                    {t('ui.fabriclegs.planned', { date: leg.planDate ?? '—' })}
                  </span>
                  <span
                    data-numeric
                    data-mono
                    style={{
                      font: '400 13px/1.3 var(--fx-font-mono)',
                      color:
                        status.selvage === 'late' ? 'var(--fx-danger)' : 'var(--fx-text-primary)',
                    }}
                  >
                    {leg.actualDate ?? (status.overdue ? t('ui.fabriclegs.not_yet') : '')}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, alignItems: 'center' }}>
                    <StatusChip status={status.selvage}>{status.word}</StatusChip>
                    <LegEditor orderId={order.id} cell={leg} canWrite={mayWrite} />
                  </span>
                </div>
                {leg.note ? (
                  <span
                    style={{ font: '400 13px/1.5 var(--fx-font-sans)', color: 'var(--fx-text-secondary)' }}
                  >
                    {leg.note}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}

        <div
          style={{
            borderTop: '1px solid var(--fx-border-subtle)',
            paddingTop: 14,
            font: '400 12px/1.5 var(--fx-font-sans)',
            color: 'var(--fx-text-tertiary)',
          }}
        >
          {t('ui.fabriclegs.footer')}
        </div>
      </div>
    </>
  )
}
