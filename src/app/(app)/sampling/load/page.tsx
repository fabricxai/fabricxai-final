import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { SectionHeading } from '@/components/fx/signature'
import { RouteHeader } from '@/components/shell/route-header'
import { getCtx } from '@/modules/core/session'
import { roomLoad } from '@/modules/sampling/service'
import { requestLocale } from '@/lib/ui-locale'

/**
 * 1.4 Sampling · the room's load — counted, never entered.
 *
 * The question asked before every "yes, we can develop that": how many samples is
 * the room already carrying this month, and for whom. Requests per month per buyer,
 * straight off `sample_requests` (HANDOFF-sampling-requisition §1). Two is a quiet
 * month and nineteen is a refusal — the number decides, so the number is visible.
 * Requests are counted equal on purpose: a blazer and a tee weigh the same here,
 * and pretending otherwise would need the costing join this screen refuses to owe.
 */
export const dynamic = 'force-dynamic'

export default async function RoomLoadPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const locale = await requestLocale()
  const months = await roomLoad(ctx, { now: new Date(), monthsBack: 4 })
  const carrying = months[0]?.open ?? 0

  return (
    <>
      <RouteHeader
        path="/sampling/load"
        locale={locale}
        eyebrow="Sampling · counted, never entered"
        title="The room's load"
        meta={
          months.length === 0
            ? 'nothing on the books'
            : `${carrying} open this month · say yes or no from a number, not a feeling`
        }
        ownsAmber
      />

      {months.length === 0 ? (
        <EmptyState
          title="The room is empty"
          body="Requests land here the moment they are raised — per month, per buyer. Raise one from the sampling board."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 980 }}>
          {months.map((month) => {
            const max = Math.max(...month.byBuyer.map((b) => b.count), 1)
            return (
              <section key={month.month}>
                <SectionHeading
                  eyebrow={`${month.total} request${month.total === 1 ? '' : 's'} raised · ${month.open} still open`}
                >
                  {month.month}
                </SectionHeading>
                <div
                  style={{
                    background: 'var(--fx-bg-surface)',
                    border: '1px solid var(--fx-border-subtle)',
                    borderRadius: 'var(--fx-radius-md)',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {month.byBuyer.map((row) => (
                    <div
                      key={row.buyer}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 220px) 1fr 48px',
                        gap: 14,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          font: '500 13.5px/1.4 var(--fx-font-sans)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.buyer}
                      </span>
                      <span
                        style={{
                          height: 10,
                          borderRadius: 5,
                          background: 'var(--fx-bg-sunken)',
                          overflow: 'hidden',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            width: `${Math.round((row.count * 100) / max)}%`,
                            height: '100%',
                            background: 'var(--fx-text-primary)',
                          }}
                        />
                      </span>
                      <span
                        data-numeric
                        data-mono
                        style={{
                          font: '500 13px/1 var(--fx-font-mono)',
                          textAlign: 'right',
                        }}
                      >
                        {row.count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}

          <p style={{ font: '400 12.5px/1.6 var(--fx-font-sans)', color: 'var(--fx-text-tertiary)' }}>
            Counted from the requests themselves — nothing on this screen is typed in. Requests
            weigh equal: a blazer and a tee are both one. The{' '}
            <Link href="/sampling" style={{ color: 'inherit' }}>
              board
            </Link>{' '}
            has each one by name.
          </p>
        </div>
      )}
    </>
  )
}
