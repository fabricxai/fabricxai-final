import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'

import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { Ident } from '@/components/fx/format'
import { SectionHeading } from '@/components/fx/signature'
import { PageHeader } from '@/components/shell/page-shell'
import { cutWastage, lays, markers } from '@/modules/cutting/schema'
import type { CuttingPolicy } from '@/modules/cutting/service'
import { getCtx } from '@/modules/core/session'
import { withTenantRead } from '@/modules/core/tenancy'
import { orders } from '@/modules/orders/schema'
import { getPolicy } from '@/modules/settings/service'

/**
 * 5.1 Cutting · wastage (canvas P4).
 *
 * Drawn, consumed, wasted — per order, and per lay underneath it.
 *
 * The figure is recomputed from every cut lay whenever one is reported, never accumulated,
 * because this is the number a factory argues about with its own owner and a counter that
 * drifts is worse than one that is slow to read. The per-lay rows are shown for the same
 * reason: an order at 3.4% overall can hide one lay at 9%, and the order-level number alone
 * would never surface it.
 */
export const dynamic = 'force-dynamic'

export default async function WastagePage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const [rows, layRows, policy] = await Promise.all([
    withTenantRead(ctx, (tx) =>
      tx
        .select({
          orderId: cutWastage.orderId,
          fabricDrawn: cutWastage.fabricDrawn,
          markerConsumption: cutWastage.markerConsumption,
          wastagePct: cutWastage.wastagePct,
          unit: cutWastage.unit,
          computedAt: cutWastage.computedAt,
          poNumbers: orders.poNumbers,
        })
        .from(cutWastage)
        .innerJoin(orders, eq(orders.id, cutWastage.orderId))
        .orderBy(desc(cutWastage.computedAt)),
    ),
    withTenantRead(ctx, (tx) =>
      tx
        .select({
          orderId: lays.orderId,
          layNo: lays.layNo,
          color: lays.color,
          plies: lays.plies,
          layLengthMeters: lays.layLengthMeters,
          fabricDrawnMeters: lays.fabricDrawnMeters,
          status: lays.status,
          markerCode: markers.code,
        })
        .from(lays)
        .innerJoin(markers, eq(markers.id, lays.markerId))
        .where(eq(lays.status, 'cut'))
        .orderBy(desc(lays.createdAt)),
    ),
    getPolicy<CuttingPolicy>(ctx, 'cutting'),
  ])

  const alertAt = policy.wastageAlertPct ? Number(policy.wastageAlertPct) : null
  const over = alertAt === null ? [] : rows.filter((r) => Number(r.wastagePct) > alertAt)

  if (rows.length === 0) {
    return (
      <FloorScreen>
        <PageHeader eyebrow="Cutting · wastage" title="Nothing cut yet" ownsAmber />
        <EmptyState
          title="No wastage to report"
          body="Wastage is measured from lays that have been reported cut — fabric drawn off the rolls against what the marker said the spread would consume."
        />
      </FloorScreen>
    )
  }

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="Cutting · wastage"
        title="Drawn, consumed, wasted"
        meta={alertAt !== null ? `alert past ${policy.wastageAlertPct}%` : undefined}
        ownsAmber
      />

      {over.length > 0 ? (
        <InlineAlert tone="warning">
          {over.length} order{over.length === 1 ? '' : 's'} past the {policy.wastageAlertPct}%
          threshold. Fabric is the largest line on most cost sheets, and a percent here is
          money that was already spent.
        </InlineAlert>
      ) : null}

      <SectionHeading eyebrow="per order">Against the marker plan</SectionHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((row) => {
          const pct = Number(row.wastagePct)
          const flagged = alertAt !== null && pct > alertAt
          return (
            <div
              key={row.orderId}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr 1fr',
                gap: 14,
                alignItems: 'center',
                padding: '16px 18px',
                border: '1px solid var(--fx-border-subtle)',
                borderLeft: `3px solid ${flagged ? 'var(--fx-warning)' : 'transparent'}`,
                background: 'var(--fx-bg-surface)',
              }}
            >
              <Ident>{row.poNumbers?.[0] ?? '—'}</Ident>
              <Figure label="Drawn" value={`${row.fabricDrawn} ${row.unit}`} />
              <Figure label="Consumed" value={`${row.markerConsumption} ${row.unit}`} />
              <Figure
                label="Waste"
                value={`${row.wastagePct}%`}
                tone={flagged ? 'warning' : pct < 0 ? 'success' : 'plain'}
              />
            </div>
          )
        })}
      </div>

      <SectionHeading eyebrow={`${layRows.length} cut`}>Lays this week</SectionHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {layRows.map((lay) => {
          // Per lay, the same arithmetic the order-level figure aggregates: what the marker
          // said this spread would take, against what actually came off the rolls.
          const planned = Number(lay.layLengthMeters) * lay.plies
          const drawn = Number(lay.fabricDrawnMeters ?? planned)
          const pct = planned > 0 ? ((drawn - planned) / planned) * 100 : 0
          const flagged = alertAt !== null && pct > alertAt
          return (
            <div
              key={lay.layNo}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr .7fr 1fr 1fr 1fr',
                gap: 12,
                alignItems: 'center',
                padding: '12px 18px',
                minHeight: 56,
                border: '1px solid var(--fx-border-subtle)',
                borderLeft: `3px solid ${flagged ? 'var(--fx-warning)' : 'transparent'}`,
                background: 'var(--fx-bg-surface)',
              }}
            >
              <Ident>{lay.layNo}</Ident>
              <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                {lay.markerCode} · {lay.color}
              </span>
              <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right' }}>
                {lay.plies}
              </span>
              <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right' }}>
                {drawn.toFixed(2)} m
              </span>
              <span
                style={{
                  font: "400 13px/1.3 var(--fx-font-mono)",
                  textAlign: 'right',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                {planned.toFixed(2)} m
              </span>
              <span
                style={{
                  font: "500 13px/1.3 var(--fx-font-mono)",
                  textAlign: 'right',
                  color: flagged ? 'var(--fx-warning)' : 'var(--fx-text-primary)',
                }}
              >
                {pct > 0 ? '+' : ''}
                {pct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </FloorScreen>
  )
}

function Figure({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: string
  tone?: 'plain' | 'warning' | 'success'
}) {
  return (
    <div>
      <div
        style={{
          font: "400 11px/1 var(--fx-font-mono)",
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--fx-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          font: "600 20px/1.1 var(--fx-font-sans)",
          color:
            tone === 'warning'
              ? 'var(--fx-warning)'
              : tone === 'success'
                ? 'var(--fx-success)'
                : 'var(--fx-text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  )
}
