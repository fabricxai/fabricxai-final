import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { Badge } from '@/components/fx/primitives'
import { Eyebrow, SectionHeading, StatusLabel } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { board, type RfqRow } from '@/modules/rfq/queries'
import type { RfqPolicy } from '@/modules/rfq/service'
import { getPolicy } from '@/modules/settings/service'

/**
 * 1.2 RFQ & Quotation.
 *
 * An enquiry is worth money only while it is still open, so the board leads
 * with what is running out of time rather than with the pipeline. A missed
 * deadline is not a status change — nothing happens, the buyer simply stops
 * writing — which is exactly why it needs to be the loudest thing here.
 */
export const dynamic = 'force-dynamic'

export default async function RfqPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const policy = await getPolicy<RfqPolicy>(ctx, 'rfq')
  const { groups, overdue } = await board(ctx, { now: new Date() })

  const live = groups
    .filter((g) => g.status === 'open' || g.status === 'clarifying' || g.status === 'quoted')
    .reduce((n, g) => n + g.rfqs.length, 0)

  const soon = groups
    .flatMap((g) => g.rfqs)
    .filter(
      (r) =>
        r.daysToDeadline !== null &&
        r.daysToDeadline >= 0 &&
        r.daysToDeadline * 24 <= policy.deadlineNearHours &&
        (r.status === 'open' || r.status === 'clarifying'),
    )

  return (
    <>
      <PageHeader
        eyebrow="RFQ & quotation"
        title={live === 0 ? 'No live enquiries' : `${live} enquiries in play`}
        meta={overdue.length > 0 ? `${overdue.length} past deadline` : undefined}
        ownsAmber
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        {overdue.length > 0 || soon.length > 0 ? (
          <section>
            <SectionHeading eyebrow={`near is ${policy.deadlineNearHours}h`}>
              Running out of time
            </SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...overdue, ...soon].map((r) => (
                <UrgentRow key={r.id} rfq={r} staleDays={policy.clarificationStaleDays} />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <SectionHeading>The board</SectionHeading>

          {groups.every((g) => g.rfqs.length === 0) ? (
            <EmptyState
              title="No enquiries yet"
              body="An RFQ is a buyer asking what something would cost. Drop their email or PDF on MARBIM and it drafts the enquiry for you to check before it exists."
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: 14,
                alignItems: 'start',
              }}
            >
              {groups.map((group) => (
                <div key={group.status} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      paddingBottom: 8,
                      borderBottom: '1px solid var(--fx-border-subtle)',
                    }}
                  >
                    <Eyebrow>{group.label}</Eyebrow>
                    <span
                      data-numeric
                      style={{
                        marginLeft: 'auto',
                        font: "500 12px/1 var(--fx-font-mono)",
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      {group.rfqs.length}
                    </span>
                  </div>

                  {group.rfqs.map((r) => (
                    <RfqCard key={r.id} rfq={r} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function UrgentRow({ rfq, staleDays }: { rfq: RfqRow; staleDays: number }) {
  const past = (rfq.daysToDeadline ?? 0) < 0
  const stale = (rfq.oldestQuestionDays ?? 0) >= staleDays

  return (
    <div
      className="fx-selvage"
      data-status={past ? 'late' : 'at-risk'}
      data-critical={past || undefined}
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
      }}
    >
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Ident>{rfq.title}</Ident>
          {rfq.buyerName ? (
            <span style={{ font: "500 14px/1.3 var(--fx-font-sans)" }}>{rfq.buyerName}</span>
          ) : null}
          <Badge>{rfq.productType}</Badge>
          <span style={{ marginLeft: 'auto' }}>
            <StatusLabel status={past ? 'late' : 'at-risk'}>
              {past
                ? `${Math.abs(rfq.daysToDeadline!)} d past deadline`
                : `${rfq.daysToDeadline} d left`}
            </StatusLabel>
          </span>
        </div>

        <div style={{ font: "400 13.5px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
          {rfq.description ?? rfq.styleCode ?? '—'} ·{' '}
          <span data-numeric>{rfq.quantity.toLocaleString()}</span> {rfq.unit}
        </div>

        {/* An unanswered question is the buyer's move, but it is still ours to
            chase — a question nobody re-asks is how an enquiry dies quietly. */}
        {rfq.openClarifications > 0 ? (
          <div
            style={{
              font: "400 12px/1.4 var(--fx-font-mono)",
              color: stale ? 'var(--fx-warning)' : 'var(--fx-text-tertiary)',
            }}
          >
            {rfq.openClarifications} question{rfq.openClarifications === 1 ? '' : 's'} waiting on the
            buyer
            {rfq.oldestQuestionDays !== null ? ` · oldest ${rfq.oldestQuestionDays} d` : ''}
            {stale ? ' · worth chasing' : ''}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function RfqCard({ rfq }: { rfq: RfqRow }) {
  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        padding: '13px 15px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        boxShadow: 'var(--fx-sh1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Ident size={12}>{rfq.title}</Ident>
        {rfq.source === 'ai_extracted' ? <Badge tone="accent">draft</Badge> : null}
      </div>

      <span style={{ font: "600 13.5px/1.3 var(--fx-font-sans)" }}>{rfq.buyerName ?? '—'}</span>

      <span
        style={{
          font: "400 12.5px/1.45 var(--fx-font-sans)",
          color: 'var(--fx-text-tertiary)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {rfq.description ?? rfq.styleCode ?? '—'}
      </span>

      {/* Target against quoted. The gap is the negotiation, so both are shown
          in the same row rather than one replacing the other. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        {rfq.targetPrice ? (
          <span
            data-numeric
            data-mono
            style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
          >
            target {rfq.targetPrice} {rfq.targetCurrency ?? rfq.currency}
          </span>
        ) : null}
        {rfq.quote ? (
          <span
            data-numeric
            data-mono
            style={{ font: "500 12.5px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-primary)' }}
          >
            quoted {rfq.quote.fobPrice} {rfq.quote.currency}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          data-numeric
          style={{ font: "400 11.5px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
        >
          {rfq.quantity.toLocaleString()} {rfq.unit}
        </span>
        {rfq.daysToDeadline !== null ? (
          <span
            data-numeric
            style={{
              marginLeft: 'auto',
              font: "400 11.5px/1.3 var(--fx-font-mono)",
              color:
                rfq.daysToDeadline < 0
                  ? 'var(--fx-danger)'
                  : rfq.daysToDeadline <= 3
                    ? 'var(--fx-warning)'
                    : 'var(--fx-text-tertiary)',
            }}
          >
            {rfq.daysToDeadline < 0 ? `${Math.abs(rfq.daysToDeadline)}d over` : `${rfq.daysToDeadline}d`}
          </span>
        ) : null}
      </div>

      {rfq.lossReasonCode ? (
        <span style={{ font: "400 11.5px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          lost · {rfq.lossReasonCode.replace(/_/g, ' ')}
        </span>
      ) : null}
    </div>
  )
}
