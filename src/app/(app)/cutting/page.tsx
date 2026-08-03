import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { Card } from '@/components/fx/data'
import { EmptyState } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { Badge } from '@/components/fx/primitives'
import { Eyebrow, SectionHeading } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { cuttableOrders, recentLays } from '@/modules/cutting/queries'

/**
 * 5.1 Cutting.
 *
 * Two gates guard spreading a lay, both server-side and both failing CLOSED:
 * the buyer's PP sample must be approved, and fabric must actually have been
 * issued to this order. Cutting before PP approval is how a factory makes
 * eighty thousand garments to a spec the buyer then rejects, with the fabric
 * already cut — so the gate blocks visibly and says which precondition failed.
 */
export const dynamic = 'force-dynamic'

export default async function CuttingPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const [lays, orders] = await Promise.all([recentLays(ctx), cuttableOrders(ctx)])

  // `lay_status` is open | cut | cancelled — there is no "closed", so the old
  // `!== 'closed'` test excluded nothing and counted every cut and cancelled lay as still
  // on the table. A cutting floor reads this number to decide whether there is space to
  // spread, and it was answering "three in progress" at an empty table.
  const open = lays.filter((l) => l.status === 'open').length
  const unreported = lays.filter((l) => l.reportedPieces === null).length

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="Cutting"
        title={lays.length === 0 ? 'Nothing spread yet' : `${open} lays open`}
        meta={unreported > 0 ? `${unreported} not reported` : undefined}
        ownsAmber
      />

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(
          [
            { href: '/cutting/lay', label: 'Start a lay' },
            { href: '/cutting/report', label: 'Cut report' },
            { href: '/cutting/wastage', label: 'Wastage' },
          ] as const
        ).map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              padding: '10px 14px',
              borderRadius: 'var(--fx-radius-md)',
              border: '1px solid var(--fx-border-default)',
              font: "500 13px/1 var(--fx-font-sans)",
              color: 'var(--fx-text-secondary)',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <Card padding="18px 22px">
          <Eyebrow>Before a lay can be spread</Eyebrow>
          <div
            style={{
              display: 'flex',
              gap: 28,
              flexWrap: 'wrap',
              marginTop: 12,
              font: "400 15px/1.55 var(--fx-font-sans)",
              color: 'var(--fx-text-secondary)',
            }}
          >
            <span>
              <strong style={{ color: 'var(--fx-text-primary)' }}>PP sample approved</strong> — the
              buyer has signed off one garment before eighty thousand
            </span>
            <span>
              <strong style={{ color: 'var(--fx-text-primary)' }}>Fabric issued</strong> — rolls
              actually left the store against this order
            </span>
          </div>
          {/* Both are checked on the server when the lay is created; neither is
              a disabled button, because a disabled button explains nothing. */}
          <div
            style={{
              marginTop: 12,
              font: "400 13px/1.5 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            both checked server-side · a blocked lay says which one failed
          </div>
        </Card>

        <section>
          <SectionHeading eyebrow={`${orders.length} in production`}>Ready to cut</SectionHeading>
          {orders.length === 0 ? (
            <div
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                padding: 24,
                font: "400 15px/1.55 var(--fx-font-sans)",
                color: 'var(--fx-text-secondary)',
              }}
            >
              No confirmed orders with a style yet.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {orders.map((o) => (
                // The card IS the action: a cutter tapping the order they are about to
                // spread is the whole navigation, and a separate "start a lay" button
                // elsewhere would be one more thing to find on a tablet.
                <Link
                  key={o.orderStyleId}
                  href={`/cutting/lay?order=${o.orderId}`}
                  style={{
                    background: 'var(--fx-bg-surface)',
                    border: '1px solid var(--fx-border-subtle)',
                    borderRadius: 'var(--fx-radius-md)',
                    padding: '14px 18px',
                    minWidth: 180,
                    minHeight: 44,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <Ident size={14}>{o.poNumber ?? '—'}</Ident>
                  <span style={{ font: "600 16px/1.3 var(--fx-font-sans)" }}>{o.styleCode}</span>
                  <span
                    style={{
                      font: "400 12px/1.3 var(--fx-font-mono)",
                      color: 'var(--fx-text-tertiary)',
                    }}
                  >
                    start a lay →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeading>Lays</SectionHeading>

          {lays.length === 0 ? (
            <EmptyState
              title="No lays spread"
              body="A lay is one spread of fabric, cut through many plies at once. Spreading it needs the PP sample approved and the fabric issued — both are checked when you start, not after."
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
                  gridTemplateColumns: '1fr 1fr 1fr .7fr .9fr .9fr .9fr',
                  gap: 12,
                  padding: '12px 20px',
                  background: 'var(--fx-bg-sunken)',
                  font: "500 12px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                <div>Lay</div>
                <div>Order</div>
                <div>Colour</div>
                <div style={{ textAlign: 'right' }}>Plies</div>
                <div style={{ textAlign: 'right' }}>Fabric</div>
                <div style={{ textAlign: 'right' }}>Cut</div>
                <div style={{ textAlign: 'right' }}>Status</div>
              </div>

              {lays.map((lay) => (
                <div
                  key={lay.id}
                  className="fx-selvage"
                  // Same phantom status as the header count had: `lay_status` is
                  // open | cut | cancelled. A cut lay is finished work and reads as done;
                  // one still open with no report is the one somebody has to chase.
                  data-status={
                    lay.status === 'cancelled'
                      ? 'done'
                      : lay.reportedPieces === null
                        ? 'at-risk'
                        : 'done'
                  }
                  style={{ borderTop: '1px solid var(--fx-border-subtle)' }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr .7fr .9fr .9fr .9fr',
                      gap: 12,
                      padding: '14px 20px',
                      alignItems: 'center',
                      minHeight: 'var(--fx-row-height)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <Ident size={14}>{lay.layNo}</Ident>
                      {lay.offlineKey ? (
                        <span
                          style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
                        >
                          from a device
                        </span>
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span style={{ font: "500 15px/1.3 var(--fx-font-sans)" }}>
                        {lay.poNumber ?? '—'}
                      </span>
                      <span
                        style={{ font: "400 13px/1.3 var(--fx-font-sans)", color: 'var(--fx-text-tertiary)' }}
                      >
                        {lay.styleCode ?? '—'}
                      </span>
                    </div>

                    <span style={{ font: "500 15px/1.3 var(--fx-font-sans)" }}>{lay.color}</span>

                    <span
                      data-numeric
                      style={{ font: "400 15px/1.2 var(--fx-font-mono)", textAlign: 'right' }}
                    >
                      {lay.plies}
                    </span>

                    <span
                      data-numeric
                      data-mono
                      style={{
                        font: "400 14px/1.2 var(--fx-font-mono)",
                        textAlign: 'right',
                        color: 'var(--fx-text-secondary)',
                      }}
                    >
                      {lay.fabricDrawnMeters ?? '—'}
                      <span style={{ color: 'var(--fx-text-tertiary)', fontSize: 12, marginLeft: 4 }}>
                        m
                      </span>
                    </span>

                    {/* Unreported is not zero: the lay is spread and nobody has
                        yet said how many pieces came off it. */}
                    <span
                      data-numeric
                      style={{
                        font: "600 16px/1.2 var(--fx-font-mono)",
                        textAlign: 'right',
                        color:
                          lay.reportedPieces === null
                            ? 'var(--fx-text-tertiary)'
                            : 'var(--fx-text-primary)',
                      }}
                    >
                      {lay.reportedPieces === null ? 'not reported' : lay.reportedPieces}
                    </span>

                    <span style={{ textAlign: 'right' }}>
                      <Badge tone={lay.status === 'closed' ? 'success' : 'neutral'}>
                        {lay.status}
                      </Badge>
                    </span>
                  </div>
                </div>
              ))}

              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--fx-border-subtle)',
                  font: "400 13px/1.4 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                bundles are generated from the cut report, and carry the QR the sewing line scans
              </div>
            </div>
          )}
        </section>
      </div>
    </FloorScreen>
  )
}
