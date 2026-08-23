import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { SectionHeading } from '@/components/fx/signature'
import { RouteHeader } from '@/components/shell/route-header'
import { getCtx } from '@/modules/core/session'
import { outcomes } from '@/modules/memory/queries'
import { orderList } from '@/modules/orders/queries'
import { quoteCloseStats } from '@/modules/rfq/queries'
import { shipmentBoard } from '@/modules/shipment/queries'

/**
 * 1.1 Buyer desk — how our buyers actually behave.
 *
 * Counted, never entered: every number here is derived from rows other modules
 * already wrote — departures from the shipment board, realised margins from the
 * memory outcomes, the open book from the order list. If a figure looks wrong,
 * the order behind it is wrong; there is nothing here to correct by hand.
 *
 * The screen says how thin its own data is, per buyer, because eight orders is a
 * pattern and two is an anecdote — and a scorecard that hides its denominator is
 * a rumour with a layout. Metrics the data cannot support yet (payment days
 * against terms, claim rates) are ABSENT, not zeroed: a 0% claims row computed
 * from no claims table would be the most dangerous number on the screen.
 */
export const dynamic = 'force-dynamic'

interface BuyerScore {
  buyer: string
  openOrders: number
  openPieces: number
  departures: number
  onTimeDepartures: number
  outcomes: number
  /** Realised margin, averaged over outcomes that carry BOTH sides of the pair. */
  quotedAvg: string | null
  actualAvg: string | null
}

/** Average of decimal-string percents at 1dp, integer arithmetic only (rule 4). */
function avgPct(values: readonly string[]): string | null {
  if (values.length === 0) return null
  let total = 0n
  for (const value of values) {
    const [whole = '0', frac = ''] = value.replace('-', '').split('.')
    const tenths = BigInt(whole) * 10n + BigInt((frac + '0').slice(0, 1))
    total += value.startsWith('-') ? -tenths : tenths
  }
  const mean = total / BigInt(values.length)
  const negative = mean < 0n
  const abs = negative ? -mean : mean
  return `${negative ? '-' : ''}${abs / 10n}.${abs % 10n}`
}

export default async function BuyerScorecardPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const [orders, shipments, memory, closing] = await Promise.all([
    orderList(ctx, { now: new Date() }),
    shipmentBoard(ctx),
    outcomes(ctx, 100),
    quoteCloseStats(ctx),
  ])
  const closingByBuyer = new Map(closing.map((row) => [row.buyerName, row]))

  const byBuyer = new Map<string, BuyerScore>()
  const score = (buyer: string | null): BuyerScore => {
    const key = buyer ?? 'No buyer on record'
    let held = byBuyer.get(key)
    if (!held) {
      held = {
        buyer: key,
        openOrders: 0,
        openPieces: 0,
        departures: 0,
        onTimeDepartures: 0,
        outcomes: 0,
        quotedAvg: null,
        actualAvg: null,
      }
      byBuyer.set(key, held)
    }
    return held
  }

  const buyerByOrderId = new Map(orders.map((o) => [o.id, o.buyerName]))
  for (const order of orders) {
    if (order.health === 'done') continue
    const row = score(order.buyerName)
    row.openOrders += 1
    row.openPieces += order.contractedQty ?? 0
  }

  for (const shipment of shipments) {
    if (!shipment.actualExFactory) continue
    const row = score(buyerByOrderId.get(shipment.orderId) ?? null)
    row.departures += 1
    if (shipment.plannedExFactory && shipment.actualExFactory <= shipment.plannedExFactory) {
      row.onTimeDepartures += 1
    }
  }

  const marginPairs = new Map<string, { quoted: string[]; actual: string[] }>()
  for (const outcome of memory) {
    if (outcome.margin.planned === null || outcome.margin.actual === null) continue
    const key = outcome.buyerName ?? 'No buyer on record'
    const held = marginPairs.get(key) ?? { quoted: [], actual: [] }
    held.quoted.push(outcome.margin.planned)
    held.actual.push(outcome.margin.actual)
    marginPairs.set(key, held)
    score(outcome.buyerName).outcomes += 1
  }
  for (const [key, pairs] of marginPairs) {
    const row = byBuyer.get(key)
    if (row) {
      row.quotedAvg = avgPct(pairs.quoted)
      row.actualAvg = avgPct(pairs.actual)
    }
  }

  const rows = [...byBuyer.values()].sort((a, b) => b.openPieces - a.openPieces)
  const totalEvidence = rows.reduce((n, r) => n + r.departures + r.outcomes, 0)

  return (
    <>
      <RouteHeader
        path="/buyers/scorecard"
        eyebrow="Buyer desk · counted, never entered"
        title="How our buyers actually behave"
        meta={rows.length > 0 ? `${rows.length} buyers · treat thin rows as a hint` : undefined}
        ownsAmber
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to count yet"
          body="Scores appear as orders ship and close — departures against their dates, realised margin against the quote. Nothing on this screen is ever typed in."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {totalEvidence < 10 ? (
            <InlineAlert tone="warning">
              This screen gets honest at scale — under ten shipped-or-closed data points across
              the book, every row is an anecdote wearing a percentage. Read the denominators,
              not the bars.
            </InlineAlert>
          ) : null}

          <section>
            <SectionHeading eyebrow="departures from the shipment board · margins from closed outcomes">
              By buyer
            </SectionHeading>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 16,
              }}
            >
              {rows.map((row) => {
                const onTimePct =
                  row.departures > 0
                    ? Math.round((row.onTimeDepartures * 100) / row.departures)
                    : null
                return (
                  <div
                    key={row.buyer}
                    style={{
                      background: 'var(--fx-bg-surface)',
                      border: '1px solid var(--fx-border-subtle)',
                      borderRadius: 'var(--fx-radius-md)',
                      boxShadow: 'var(--fx-sh1)',
                      padding: '20px 22px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ font: '600 16px/1.2 var(--fx-font-sans)' }}>{row.buyer}</span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          font: '400 12px/1.4 var(--fx-font-mono)',
                          color: 'var(--fx-text-tertiary)',
                        }}
                      >
                        {row.openOrders} open · {row.openPieces.toLocaleString()} pcs
                      </span>
                    </div>

                    <ScoreLine
                      label="Ships on time"
                      value={onTimePct !== null ? `${onTimePct}%` : null}
                      pct={onTimePct}
                      basis={
                        row.departures > 0
                          ? `${row.onTimeDepartures} of ${row.departures} departure${row.departures === 1 ? '' : 's'} on or before their date`
                          : 'no departures recorded yet'
                      }
                    />
                    <ScoreLine
                      label="How they close"
                      value={
                        closingByBuyer.get(row.buyer)?.avgCloseBelowFirstPct !== null &&
                        closingByBuyer.get(row.buyer) !== undefined
                          ? `−${closingByBuyer.get(row.buyer)!.avgCloseBelowFirstPct}%`
                          : null
                      }
                      pct={null}
                      basis={
                        closingByBuyer.get(row.buyer)
                          ? closingByBuyer.get(row.buyer)!.avgCloseBelowFirstPct !== null
                            ? `mean drop from first sent price to the closed order, over ${closingByBuyer.get(row.buyer)!.won} wins`
                            : `${closingByBuyer.get(row.buyer)!.won} closed quote${closingByBuyer.get(row.buyer)!.won === 1 ? '' : 's'} — under three, no average is printed`
                          : 'no quotes sent yet'
                      }
                    />
                    <ScoreLine
                      label="Margin we keep"
                      value={row.actualAvg !== null ? `${row.actualAvg}%` : null}
                      pct={
                        row.actualAvg !== null
                          ? Math.max(0, Math.min(100, Math.round(Number(row.actualAvg) * 4)))
                          : null
                      }
                      basis={
                        row.actualAvg !== null
                          ? `realised, over ${row.outcomes} closed outcome${row.outcomes === 1 ? '' : 's'} · quoted ${row.quotedAvg}%`
                          : 'no closed outcome carries both sides of the pair yet'
                      }
                    />
                  </div>
                )
              })}
            </div>
          </section>

          <div
            style={{
              background: 'var(--fx-bg-surface)',
              border: '1px solid var(--fx-border-subtle)',
              borderRadius: 'var(--fx-radius-md)',
              padding: '18px 22px',
              font: '400 13px/1.65 var(--fx-font-sans)',
              color: 'var(--fx-text-secondary)',
            }}
          >
            <strong>What is counted from what.</strong> On-time is a departure&rsquo;s actual
            ex-factory against its own planned date, from the shipment board. Margin is the
            realised-against-quoted pair a closed order&rsquo;s outcome compiles — it moves only
            when an order closes. Payment days against terms and claim rates are absent, not
            zero: the ledgers they need do not carry those facts yet, and a zero computed from
            nothing would be the most dangerous number on this screen.
          </div>
        </div>
      )}
    </>
  )
}

function ScoreLine({
  label,
  value,
  pct,
  basis,
}: {
  label: string
  value: string | null
  pct: number | null
  basis: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ font: '400 13.5px/1.3 var(--fx-font-sans)' }}>{label}</span>
        <span
          data-numeric
          data-mono
          style={{
            marginLeft: 'auto',
            font: '500 14px/1 var(--fx-font-mono)',
            color: value === null ? 'var(--fx-text-disabled)' : 'var(--fx-text-primary)',
          }}
        >
          {value ?? '—'}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--fx-bg-sunken)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct ?? 0}%`,
            height: '100%',
            background:
              pct === null
                ? 'transparent'
                : pct >= 80
                  ? 'var(--fx-success)'
                  : pct >= 50
                    ? 'var(--fx-warning)'
                    : 'var(--fx-danger)',
          }}
        />
      </div>
      <span style={{ font: '400 11.5px/1.5 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}>
        {basis}
      </span>
    </div>
  )
}
