import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { Badge } from '@/components/fx/primitives'
import { EmptyState } from '@/components/fx/feedback'
import { Ident } from '@/components/fx/format'
import { milestoneLabel } from '@/components/fx/tna'
import { StatusLabel } from '@/components/fx/signature'
import { AskAboutRow } from '@/components/shell/ask-about-row'
import { PageHeader } from '@/components/shell/page-shell'
import { WorkCue } from '@/components/shell/work-cue'
import { canWrite, NAV } from '@/components/shell/nav'
import { FloorTabs } from '@/components/shell/floor-tabs'
import { FigureTile } from '@/components/fx/figures'
import { getCtx } from '@/modules/core/session'
import { buyerAccounts } from '@/modules/buyers/queries'
import { lcsForOrders, type OrderLcRow } from '@/modules/commercial/queries'
import { companyProfile } from '@/modules/settings/service'
import { milestonesInWindow, orderList, type OrderHealth } from '@/modules/orders/queries'
import { factoryToday } from '@/lib/dates'
import { money, sum } from '@/lib/money'
import { requestLocale } from '@/lib/ui-locale'

import { NewOrderButton } from './new-order'
import { buildWeek, WeekStrip } from './week-strip'

/**
 * 1.3 Order Desk — the book.
 *
 * The selvage carries order health and the status column repeats it in words,
 * because a wall of rows read at arm's length has to survive somebody who does
 * not see the difference between amber and red.
 */
export const dynamic = 'force-dynamic'

const SELVAGE: Record<OrderHealth, 'on-track' | 'at-risk' | 'late' | 'done'> = {
  ok: 'on-track',
  risk: 'at-risk',
  late: 'late',
  done: 'done',
}

const WORD: Record<OrderHealth, string> = {
  ok: 'on track',
  risk: 'at risk',
  late: 'late',
  done: 'closed',
}

/**
 * The order's own status, in words.
 *
 * It was rendered raw, so a desk with a healthy order book printed `shipped_partial` and
 * `in_production` at people — the same defect as the milestone key one line below, found
 * the same way: by looking at a tenant that had actually reached those states. An unmapped
 * status falls through to the identifier rather than to an empty badge, because a missing
 * word should look like one.
 */
const STATUS_WORD: Record<string, string> = {
  confirmed: 'confirmed',
  in_production: 'in production',
  shipped_partial: 'part shipped',
  shipped_full: 'shipped',
  closed: 'closed',
  cancelled: 'cancelled',
}

export default async function OrdersPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const locale = await requestLocale()
  const today = factoryToday()
  const rows = await orderList(ctx, { now: new Date() })
  const open = rows.filter((r) => r.health !== 'done')
  const late = rows.filter((r) => r.health === 'late').length
  const risk = rows.filter((r) => r.health === 'risk').length

  // Read through the buyers module's own queries (rule 11), not its tables.
  const profile = await companyProfile(ctx)
  const mayWrite = canWrite(
    NAV.find((n) => n.id === 'orders')!,
    ctx.roles,
    profile?.factoryType ?? 'woven',
  )
  const buyers = mayWrite ? await buyerAccounts(ctx) : []
  // A viewer sees the operation, not the commercial terms (live-test finding, Phase 9).
  const seesPrices = ctx.roles.some((r) => r !== 'viewer' && r !== 'member')

  /*
   * The credits behind the book, read through commercial's own query (rule 11). One row
   * per order–LC link; an order can carry several and the column shows the worst float,
   * because the worst one is the one the bank refuses documents over.
   */
  const lcRows = await lcsForOrders(ctx, rows.map((r) => r.id))
  const lcByOrder = new Map<string, OrderLcRow>()
  for (const lc of lcRows) {
    const held = lcByOrder.get(lc.orderId)
    if (!held || (lc.floatDays ?? Infinity) < (held.floatDays ?? Infinity)) {
      lcByOrder.set(lc.orderId, lc)
    }
  }
  const lcConflicts = [...lcByOrder.values()].filter(
    (lc) => lc.floatDays !== null && lc.floatDays < 0,
  ).length

  // This week's milestones, graded by last night's scan.
  const weekEnd = new Date(`${today}T00:00:00Z`)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + (7 - ((weekEnd.getUTCDay() + 6) % 7)) - 1)
  const week = buildWeek(
    today,
    await milestonesInWindow(ctx, { from: today, to: weekEnd.toISOString().slice(0, 10) }),
  )

  /*
   * Book value: open orders only, one currency at a time. Mixed-currency books show the
   * largest bucket and say so in the basis — adding USD to BDT is not a number, and this
   * screen does not invent one.
   */
  const byCurrency = new Map<string, { total: ReturnType<typeof money>; count: number }>()
  for (const row of open) {
    if (!row.totalValue) continue
    const held = byCurrency.get(row.currency)
    byCurrency.set(row.currency, {
      total: held ? sum([held.total, money(row.totalValue, row.currency)]) : money(row.totalValue, row.currency),
      count: (held?.count ?? 0) + 1,
    })
  }
  const bookValue = [...byCurrency.entries()].sort((a, b) => b[1].count - a[1].count)[0] ?? null

  // Shipping inside 30 days — the horizon a merchandiser actually plans loading against.
  const horizon = new Date(`${today}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 30)
  const horizonIso = horizon.toISOString().slice(0, 10)
  const shippingSoon = open.filter(
    (r) => r.plannedExFactoryDate && r.plannedExFactoryDate >= today && r.plannedExFactoryDate <= horizonIso,
  )

  const cueItems = [
    ...(late > 0 ? [{ label: `${late} late order${late === 1 ? '' : 's'}`, href: '/orders' }] : []),
    ...(risk > 0 ? [{ label: `${risk} at risk`, href: '/orders' }] : []),
  ]

  return (
    <>
      <PageHeader
        eyebrow="Order desk"
        title={rows.length === 0 ? 'No orders yet' : `${rows.length} orders`}
        meta={late > 0 ? `${late} late` : undefined}
        ownsAmber
        actions={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/orders/inputs"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 'var(--fx-tap-min)',
                padding: '10px 18px',
                borderRadius: 'var(--fx-radius-md)',
                border: '1px solid var(--fx-border-default)',
                font: '600 14px/1 var(--fx-font-sans)',
                color: 'var(--fx-text-primary)',
                textDecoration: 'none',
              }}
            >
              Inputs readiness
            </Link>
            {mayWrite ? <NewOrderButton buyers={buyers} /> : null}
          </span>
        }
      />

      <WorkCue items={cueItems} />

      {rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 32 }}>
          {/*
            * The KPI row the build pack specified and the book never had: value, the loading
            * horizon, what can still be acted on, and the conflicts a bank will not waive.
            * Every basis names its denominator — rule of the FigureTile, and the difference
            * between a number and a claim.
            */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            <FigureTile
              label="Order book value"
              figure={
                !seesPrices
                  ? { unavailable: 'your role sees the operation, not the terms' }
                  : bookValue
                    ? { value: bookValue[1].total.amount }
                    : { unavailable: 'no order carries a value yet' }
              }
              unit={bookValue?.[0]}
              basis={
                bookValue
                  ? byCurrency.size > 1
                    ? `${bookValue[1].count} open orders in ${bookValue[0]} — others excluded`
                    : `${open.length} open order${open.length === 1 ? '' : 's'}`
                  : `${open.length} open order${open.length === 1 ? '' : 's'}`
              }
            />
            <FigureTile
              label="Shipping in 30 days"
              figure={{ value: shippingSoon.length }}
              unit={shippingSoon.length === 1 ? 'order' : 'orders'}
              basis={
                shippingSoon.length > 0
                  ? `${shippingSoon
                      .reduce((pieces, r) => pieces + (r.contractedQty ?? 0), 0)
                      .toLocaleString()} pcs by ${horizonIso}`
                  : `nothing due before ${horizonIso}`
              }
            />
            <FigureTile
              label="At risk"
              figure={{ value: risk }}
              unit={risk === 1 ? 'order' : 'orders'}
              basis="the only state anyone can still act on"
              tone={risk > 0 ? 'warning' : 'neutral'}
            />
            <FigureTile
              label="LC conflicts"
              figure={{ value: lcConflicts }}
              unit={lcConflicts === 1 ? 'order' : 'orders'}
              basis={
                lcConflicts > 0
                  ? 'ex-factory after the credit’s latest shipment'
                  : `${lcByOrder.size} of ${open.length} covered by a credit`
              }
              tone={lcConflicts > 0 ? 'danger' : 'neutral'}
            />
          </div>

          <WeekStrip days={week} locale={locale} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="The book is empty"
          body="Orders arrive from a buyer PO — drop one on MARBIM and it drafts the order, its TNA and the size breakdown for you to approve. Or open one here and enter it yourself."
          action={
            mayWrite ? (
              <span style={{ font: '400 13px/1.4 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
                Use New order above, or check Your work for drafts.
              </span>
            ) : ctx.roles.some((r) => r === 'owner' || r === 'admin' || r === 'merchandiser') ? (
              <Link
                href="/home"
                style={{
                  font: '500 13px/1 var(--fx-font-sans)',
                  color: 'var(--fx-accent-pressed)',
                  textDecoration: 'none',
                }}
              >
                See Your work →
              </Link>
            ) : undefined
          }
        />
      ) : (
        /*
         * Scrolls sideways inside the card, not with the page (plan 4.4).
         *
         * Seven columns cannot stack — the header is one grid and every row is another,
         * so stacking would leave the labels above columns they no longer line up with.
         * The minimum keeps each column readable and lets the card scroll; a cut-off
         * column says there is more to the right, which a page that quietly grew wider
         * than the screen does not.
         */
        <div
          className="fx-scroll-x"
          // Focusable, or a keyboard cannot scroll it (WCAG 2.1.1). Found by 7.2's
          // axe sweep at the tablet viewport — the check 4.4 could not make when it
          // added this wrapper, because there was no browser to make it in.
          tabIndex={0}
          style={{
            background: 'var(--fx-bg-surface)',
            border: '1px solid var(--fx-border-subtle)',
            borderRadius: 'var(--fx-radius-md)',
            overflowY: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 1fr 1.5fr .7fr .9fr .8fr .85fr .9fr',
              minWidth: 860,
              gap: 14,
              padding: '10px 18px 10px 21px',
              background: 'var(--fx-bg-sunken)',
              font: "500 11px/1 var(--fx-font-mono)",
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            <div>PO</div>
            <div>Buyer</div>
            <div>Style</div>
            <div style={{ textAlign: 'right' }}>Qty</div>
            <div style={{ textAlign: 'right' }}>Value</div>
            <div>Ex-factory</div>
            <div>LC</div>
            <div style={{ textAlign: 'right' }}>Status</div>
          </div>

          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/orders/${row.id}`}
              className="fx-selvage"
              data-status={SELVAGE[row.health]}
              data-critical={row.health === 'late' || undefined}
              style={{
                borderTop: '1px solid var(--fx-border-subtle)',
                textDecoration: 'none',
                color: 'inherit',
                display: 'flex',
              }}
            >
              <div
                style={{
                  flex: 1,
                                    display: 'grid',
                  gridTemplateColumns: '1.1fr 1fr 1.5fr .7fr .9fr .8fr .85fr .9fr',
                  minWidth: 860,
                  gap: 14,
                  padding: '14px 18px',
                  alignItems: 'center',
                  minHeight: 'var(--fx-row-height)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Ident>{row.poNumbers[0] ?? '—'}</Ident>
                  {/* The code travels, not the uuid — the resolvers read what the row prints. */}
                  {row.poNumbers[0] ? <AskAboutRow code={row.poNumbers[0]} /> : null}
                </span>
                <span style={{ font: "400 14px/1.3 var(--fx-font-sans)" }}>
                  {row.buyerName ?? '—'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ font: "500 14px/1.3 var(--fx-font-sans)" }}>
                    {row.styleCode ?? '—'}
                  </span>
                  {row.description ? (
                    <span
                      style={{
                        font: "400 12.5px/1.3 var(--fx-font-sans)",
                        color: 'var(--fx-text-tertiary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.description}
                    </span>
                  ) : null}
                </div>
                <span
                  data-numeric
                  style={{
                    font: "400 13px/1.3 var(--fx-font-mono)",
                    color: 'var(--fx-text-secondary)',
                    textAlign: 'right',
                  }}
                >
                  {row.contractedQty?.toLocaleString() ?? '—'}
                </span>
                {/* Money renders as the stored decimal string with its currency —
                    never parsed into a float on the way to the screen. */}
                <span
                  data-numeric
                  data-mono
                  style={{
                    font: "400 13px/1.3 var(--fx-font-mono)",
                    color: 'var(--fx-text-secondary)',
                    textAlign: 'right',
                  }}
                >
                  {!seesPrices ? '•••' : row.totalValue ? `${row.totalValue} ${row.currency}` : '—'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span
                    data-numeric
                    data-mono
                    style={{ font: "400 13px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}
                  >
                    {row.plannedExFactoryDate ?? '—'}
                  </span>
                  {row.daysToExFactory !== null && row.health !== 'done' ? (
                    <span
                      style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
                    >
                      {row.daysToExFactory >= 0 ? `${row.daysToExFactory} d` : `${-row.daysToExFactory} d over`}
                    </span>
                  ) : null}
                </div>
                {(() => {
                  const lc = lcByOrder.get(row.id)
                  const conflict = lc?.floatDays !== null && lc !== undefined && lc.floatDays < 0
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span
                        style={{
                          font: '400 13px/1.3 var(--fx-font-mono)',
                          color: 'var(--fx-text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lc?.number ?? '—'}
                      </span>
                      {lc ? (
                        <span
                          style={{
                            font: '400 12px/1.3 var(--fx-font-mono)',
                            color: conflict ? 'var(--fx-danger)' : 'var(--fx-text-tertiary)',
                          }}
                        >
                          {conflict
                            ? `${-lc.floatDays!} d over`
                            : lc.floatDays !== null
                              ? `${lc.floatDays} d float`
                              : lc.status}
                        </span>
                      ) : (
                        <span
                          style={{ font: '400 12px/1.3 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}
                        >
                          no credit yet
                        </span>
                      )}
                    </div>
                  )
                })()}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    alignItems: 'flex-end',
                    textAlign: 'right',
                  }}
                >
                  <StatusLabel status={SELVAGE[row.health]}>{WORD[row.health]}</StatusLabel>
                  {row.headline ? (
                    <span
                      style={{
                        font: "400 12px/1.3 var(--fx-font-sans)",
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      {milestoneLabel(row.headline, locale)}
                    </span>
                  ) : (
                    <Badge>{STATUS_WORD[row.status] ?? row.status}</Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {/* The Desk skin's pocket bar — never for the viewer, whose only capability is this
          page and whose tabs would point at locked doors. */}
      {ctx.roles.some((r) => ['merchandiser', 'commercial', 'owner', 'admin'].includes(r)) ? (
        <FloorTabs
          tabs={[
            { href: '/home', label: 'My work' },
            { href: '/orders', label: 'Orders' },
            { href: '/marbim/intake', label: 'Capture' },
          ]}
        />
      ) : null}
    </>
  )
}
