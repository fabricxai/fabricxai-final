import { Card } from '@/components/fx/data'
import { Badge } from '@/components/fx/primitives'
import type { OrderRunRate } from '@/modules/production/queries'

/**
 * The run-rate card (canvas P4) — a window into production from the order page.
 *
 * Read-only by design. A merchandiser looking at a slipping date wants to know, not to
 * intervene from here; the intervention is a conversation with planning, and a button on
 * this card would only produce a change nobody on the floor agreed to.
 *
 * **The projected date is never shown without the assumption that produced it.** A bare
 * "completes 4 Sep" gets forwarded to a buyer and becomes a commitment. "Completes 4 Sep at
 * 1,240 a day, the last 3 days' average" gets questioned — which is the point, because the
 * assumption is the part that is wrong when the date is wrong.
 */
export function RunRateCard({ forecast }: { forecast: OrderRunRate }) {
  const { confidence } = forecast

  // Pieces per day, not money: `ratePerDay` is an output run-rate off the sewing floor.
  // Formatted once here so the reason for the exemption is stated once too.
  // eslint-disable-next-line fabricxai/no-float-money
  const perDay = Number(forecast.ratePerDay).toLocaleString()

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span
            style={{
              font: "400 11px/1 var(--fx-font-mono)",
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            Run rate
          </span>
          {forecast.atRisk ? (
            <Badge tone="danger">
              at risk · {forecast.slipDays} day{forecast.slipDays === 1 ? '' : 's'} late
            </Badge>
          ) : confidence === 'none' ? (
            <Badge tone="neutral">nothing sewn yet</Badge>
          ) : (
            <Badge tone="success">on track</Badge>
          )}
          {confidence === 'low' ? <Badge tone="warning">one day of output only</Badge> : null}
        </div>

        <div style={{ display: 'flex', gap: 44, flexWrap: 'wrap' }}>
          <Figure
            label="Completes"
            value={forecast.forecastDate ?? '—'}
            tone={forecast.atRisk ? 'var(--fx-danger)' : undefined}
          />
          <Figure label="Sewn" value={`${forecast.sewnQty.toLocaleString()} pcs`} />
          <Figure label="Remaining" value={`${forecast.remainingQty.toLocaleString()} pcs`} />
          <Figure
            label="Rate"
            // Pieces per day, not money.
            value={confidence === 'none' ? '—' : `${perDay}/day`}
          />
        </div>

        {/* The assumption. Never separable from the date above it — see the file note. */}
        <p
          style={{
            margin: 0,
            font: "400 12.5px/1.6 var(--fx-font-mono)",
            color: 'var(--fx-text-tertiary)',
          }}
        >
          {/* Pieces per day, not money — same identifier as above. */}
          {confidence === 'none'
            ? `No output booked against this order in the last ${forecast.trailingDays} days, so there is no rate to project from. This is not a date of zero — it is the absence of one.`
            : `At ${perDay} a day — the average of the last ${forecast.trailingDays} days, ${forecast.daysWithOutput} of which the floor ran. Days with no output count as zero.`}
          {forecast.milestoneDate
            ? ` Sewing is due ${forecast.milestoneDate}.`
            : ' No sewing milestone is set on the TNA to compare against.'}
        </p>
      </div>
    </Card>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
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
          marginTop: 7,
          font: "600 26px/1.1 var(--fx-font-sans)",
          fontVariantNumeric: 'tabular-nums',
          color: tone ?? 'var(--fx-text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  )
}
