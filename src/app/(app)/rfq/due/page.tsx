import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { Ident } from '@/components/fx/format'
import { StatusChip } from '@/components/fx/status-chip'
import { RouteHeader } from '@/components/shell/route-header'
import { getBomForStyle } from '@/modules/costing/queries'
import { getCtx } from '@/modules/core/session'
import { outcomes } from '@/modules/memory/queries'
import { board } from '@/modules/rfq/queries'
import { requestLocale } from '@/lib/ui-locale'

/**
 * 1.2 RFQ — the quotes-due lane.
 *
 * Enquiries arrive in batches with a clock on them ("best prices by end tomorrow"),
 * and the board files them under statuses while the clock runs out. This lane is the
 * clock's own view: everything still owed a price, soonest deadline first, the
 * overdue ones shouting. Beside each card, the two things a quote decision actually
 * leans on — the bill of materials to price from, and what a similar order REALLY
 * earned last time, from the memory outcomes.
 *
 * The memory panel matches by buyer, deliberately: the honest version of "have we
 * made this before" that needs no embedding call. The vector search stays MARBIM's.
 */
export const dynamic = 'force-dynamic'

export default async function QuotesDuePage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const locale = await requestLocale()
  const [rfqBoard, memory] = await Promise.all([board(ctx, { now: new Date() }), outcomes(ctx, 40)])

  /*
   * Owed a price = open or clarifying with a deadline, plus everything overdue.
   * Quoted-and-waiting is the buyer's clock, not ours — it lives on /buyers/waiting.
   */
  const owed = rfqBoard.groups
    .flatMap((g) => g.rfqs)
    .filter((r) => (r.status === 'open' || r.status === 'clarifying') && r.deadline !== null)
    .sort((a, b) => (a.daysToDeadline ?? 0) - (b.daysToDeadline ?? 0))

  // The BOM behind each style, where one exists — the "price from here" link.
  const bomByStyle = new Map<string, string>()
  await Promise.all(
    [...new Set(owed.map((r) => r.styleCode).filter((c): c is string => !!c))].map(async (code) => {
      try {
        const ref = await getBomForStyle(ctx, code)
        bomByStyle.set(code, ref.bomId)
      } catch {
        // No approved sheet behind the style — the card says "no BOM yet" instead.
      }
    }),
  )

  const outcomesByBuyer = new Map<string, typeof memory>()
  for (const card of memory) {
    if (!card.buyerName || card.margin.actual === null) continue
    const held = outcomesByBuyer.get(card.buyerName) ?? []
    if (held.length < 2) held.push(card)
    outcomesByBuyer.set(card.buyerName, held)
  }

  const overdue = owed.filter((r) => (r.daysToDeadline ?? 0) < 0)

  return (
    <>
      <RouteHeader
        path="/rfq/due"
        locale={locale}
        eyebrow="RFQ &amp; quotation · the clock's own view"
        title="Quotes due"
        meta={
          owed.length === 0
            ? 'nothing owed a price'
            : `${owed.length} owed a price${overdue.length > 0 ? ` · ${overdue.length} past deadline` : ''}`
        }
        ownsAmber
      />

      {owed.length === 0 ? (
        <EmptyState
          title="Nothing is owed a price"
          body="Enquiries with deadlines land here the moment they arrive — soonest first, overdue loudest. The board keeps the full pipeline."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}
        >
          {owed.map((rfq) => {
            const days = rfq.daysToDeadline
            const status =
              days !== null && days < 0 ? 'late' : days !== null && days <= 1 ? 'at-risk' : 'on-track'
            const word =
              days === null
                ? 'no clock'
                : days < 0
                  ? `${Math.abs(days)} d over`
                  : days === 0
                    ? 'due today'
                    : `${days} d left`
            const bomId = rfq.styleCode ? bomByStyle.get(rfq.styleCode) : undefined
            const history = rfq.buyerName ? (outcomesByBuyer.get(rfq.buyerName) ?? []) : []

            return (
              <div
                key={rfq.id}
                className="fx-selvage"
                data-status={status}
                style={{
                  background: 'var(--fx-bg-surface)',
                  border: '1px solid var(--fx-border-subtle)',
                  borderRadius: 'var(--fx-radius-md)',
                  boxShadow: 'var(--fx-sh1)',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {rfq.styleCode ? <Ident>{rfq.styleCode}</Ident> : null}
                    <span style={{ marginLeft: 'auto' }}>
                      <StatusChip status={status}>{word}</StatusChip>
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ font: '600 15px/1.25 var(--fx-font-sans)' }}>{rfq.title}</span>
                    <span
                      style={{
                        font: '400 12px/1.5 var(--fx-font-mono)',
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      {[
                        `${rfq.quantity.toLocaleString()} ${rfq.unit}`,
                        rfq.buyerName,
                        rfq.targetPrice ? `target ${rfq.targetPrice} ${rfq.targetCurrency ?? rfq.currency}` : null,
                        rfq.openClarifications > 0 ? `${rfq.openClarifications} open question${rfq.openClarifications === 1 ? '' : 's'}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>

                  {history.length > 0 ? (
                    <div
                      style={{
                        borderTop: '1px solid var(--fx-border-subtle)',
                        paddingTop: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          font: '500 10.5px/1 var(--fx-font-mono)',
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: 'var(--fx-text-tertiary)',
                        }}
                      >
                        what this buyer really earned
                      </span>
                      {history.map((card) => (
                        <span
                          key={card.outcomeId}
                          style={{
                            font: '400 12.5px/1.5 var(--fx-font-sans)',
                            color: 'var(--fx-text-secondary)',
                          }}
                        >
                          {card.styleCode ?? card.poNumber} — quoted {card.margin.planned}%,
                          kept{' '}
                          <span
                            style={{
                              color:
                                card.margin.actual !== null &&
                                card.margin.planned !== null &&
                                card.margin.actual < card.margin.planned
                                  ? 'var(--fx-danger)'
                                  : 'var(--fx-success)',
                            }}
                          >
                            {card.margin.actual}%
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div
                    style={{
                      borderTop: '1px solid var(--fx-border-subtle)',
                      paddingTop: 12,
                      display: 'flex',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    {bomId ? (
                      <Link
                        href={`/costing?bomId=${bomId}`}
                        style={{ font: '600 13px/1 var(--fx-font-sans)', color: 'var(--fx-text-primary)' }}
                      >
                        Price it from the BOM →
                      </Link>
                    ) : (
                      <span
                        style={{ font: '400 12.5px/1 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}
                      >
                        no BOM yet — drop the tech pack on MARBIM
                      </span>
                    )}
                    <Link
                      href="/rfq"
                      style={{
                        marginLeft: 'auto',
                        font: '500 12.5px/1 var(--fx-font-sans)',
                        color: 'var(--fx-text-secondary)',
                      }}
                    >
                      board →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p
        style={{
          marginTop: 24,
          font: '400 12.5px/1.5 var(--fx-font-sans)',
          color: 'var(--fx-text-tertiary)',
        }}
      >
        Quoted-and-waiting is the buyer’s clock, not ours — it lives on{' '}
        <Link href="/buyers/waiting" style={{ color: 'inherit' }}>
          Waiting on the buyer
        </Link>
        .
      </p>
    </>
  )
}
