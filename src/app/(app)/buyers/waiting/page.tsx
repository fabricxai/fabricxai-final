import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { Badge } from '@/components/fx/primitives'
import { StatusLabel } from '@/components/fx/signature'
import { RouteHeader } from '@/components/shell/route-header'
import { getCtx } from '@/modules/core/session'
import { orderList } from '@/modules/orders/queries'
import { board } from '@/modules/rfq/queries'
import { sampleBoard } from '@/modules/sampling/queries'
import { requestLocale } from '@/lib/ui-locale'

/**
 * 1.1 Buyer desk — everything currently sitting with a buyer.
 *
 * Half a merchandiser's day is chasing, and the two things they chase live in different
 * modules: an unanswered clarification on an RFQ, and a sample dispatched with no verdict
 * back. Both were already measured — `board()` has carried `waitingOnBuyer` and
 * `oldestQuestionDays` since the RFQ module shipped, and the sample board knows which
 * rounds went out and never came back — and neither was ever shown as one list. The
 * merchandiser kept that list in their head, which is why the oldest item on it is always
 * the one they forgot.
 *
 * Read across two modules through their own `queries.ts`, never their tables (rule 11).
 * Nothing here writes: this screen exists to tell you who to ring.
 */
export const dynamic = 'force-dynamic'

type Waiting = {
  readonly key: string
  readonly what: string
  readonly ref: string
  readonly buyer: string
  readonly days: number | null
  readonly href: string
}

/** Oldest first, and anything undated last — a question with no clock is not urgent, it is lost. */
function byAge(a: Waiting, b: Waiting): number {
  if (a.days === null) return b.days === null ? 0 : 1
  if (b.days === null) return -1
  return b.days - a.days
}

/**
 * The words for how long something has sat. Deliberately coarse: a merchandiser acts on
 * "two weeks" and does nothing differently at thirteen days.
 */
function ageStatus(days: number | null): 'on-track' | 'at-risk' | 'late' {
  if (days === null) return 'at-risk'
  if (days >= 10) return 'late'
  if (days >= 5) return 'at-risk'
  return 'on-track'
}

export default async function WaitingOnBuyerPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const locale = await requestLocale()
  const now = new Date()

  const [rfqBoard, samples, orders] = await Promise.all([
    board(ctx, { now }),
    sampleBoard(ctx, { now }),
    orderList(ctx, { now }),
  ])

  /*
   * The sample board carries the PO it was raised against but not the buyer behind it —
   * a sample belongs to a style, and the buyer is the order's fact. Read through the
   * orders module's own query rather than reaching into its tables (rule 11).
   */
  const buyerByPo = new Map(
    orders.flatMap((o) => o.poNumbers.map((po) => [po, o.buyerName] as const)),
  )

  const clarifications: Waiting[] = rfqBoard.groups
    .flatMap((g) => g.rfqs)
    .filter((r) => r.waitingOnBuyer && r.openClarifications > 0)
    .map((r) => ({
      key: `rfq-${r.id}`,
      what:
        r.openClarifications === 1
          ? 'Clarification we asked for'
          : `${r.openClarifications} clarifications we asked for`,
      ref: [r.styleCode, r.title].filter(Boolean).join(' · ') || r.title,
      buyer: r.buyerName ?? 'no buyer on the enquiry',
      days: r.oldestQuestionDays,
      href: '/rfq',
    }))

  /*
   * A sample is with the buyer once it is dispatched and before a verdict lands. `feedback`
   * means the verdict arrived and is ours to act on, so it is NOT waiting on them — the
   * distinction is the whole point of the screen.
   */
  const awaitingVerdict: Waiting[] = samples
    .filter((s) => s.status === 'dispatched')
    .map((s) => ({
      key: `sample-${s.id}`,
      what:
        s.latestVerdict === null
          ? `${s.type.toUpperCase()} sample — first verdict`
          : `${s.type.toUpperCase()} sample — verdict on round ${s.latestVerdict.round + 1}`,
      ref: [s.requestNo, s.styleCode, s.poNumber].filter(Boolean).join(' · '),
      buyer: (s.poNumber ? buyerByPo.get(s.poNumber) : null) ?? 'not on an order yet',
      // The due date is the sample's own deadline; days waited is what this screen is about,
      // and an overdue sample is the only one where the two coincide.
      days: s.daysToDue !== null && s.daysToDue < 0 ? Math.abs(s.daysToDue) : null,
      href: `/sampling/${s.id}`,
    }))

  const rows = [...clarifications, ...awaitingVerdict].sort(byAge)
  const oldest = rows[0]?.days ?? null

  return (
    <>
      <RouteHeader
        path="/buyers/waiting"
        locale={locale}
        eyebrow="Buyer desk · chasing"
        title="Waiting on the buyer"
        meta={
          rows.length === 0
            ? 'nothing outstanding'
            : oldest === null
              ? `${rows.length} open`
              : `${rows.length} open · oldest ${oldest} days`
        }
        ownsAmber
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nobody owes you an answer"
          body="Every clarification has been answered and no sample is sitting with a buyer unverdicted. This screen fills itself as you ask."
        />
      ) : (
        <div
          style={{
            background: 'var(--fx-bg-surface)',
            border: '1px solid var(--fx-border-subtle)',
            borderRadius: 'var(--fx-radius-md)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.7fr 1.4fr 1fr .8fr',
              gap: 16,
              padding: '10px 22px',
              background: 'var(--fx-bg-sunken)',
              font: '500 11px/1 var(--fx-font-mono)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            <span>What we are waiting for</span>
            <span>Which one</span>
            <span>Buyer</span>
            <span>Waiting</span>
          </div>

          {rows.map((row) => (
            <div key={row.key} className="fx-selvage" data-status={ageStatus(row.days)}>
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: '1.7fr 1.4fr 1fr .8fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '13px 18px 13px 15px',
                  minHeight: 'var(--fx-row-height)',
                  borderTop: '1px solid var(--fx-border-subtle)',
                  font: '400 14px/1.3 var(--fx-font-sans)',
                }}
              >
                <a href={row.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                  {row.what}
                </a>
                <span style={{ font: '400 13px/1.3 var(--fx-font-mono)' }}>{row.ref}</span>
                <span>{row.buyer}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  {row.days === null ? (
                    <Badge>no clock</Badge>
                  ) : (
                    <>
                      <span data-numeric data-mono>
                        {row.days} d
                      </span>
                      <StatusLabel status={ageStatus(row.days)}>
                        {ageStatus(row.days) === 'late' ? 'chase' : 'waiting'}
                      </StatusLabel>
                    </>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
