import type { ReactNode } from 'react'

import { Eyebrow } from './signature'

/**
 * Owner-dashboard figures.
 *
 * Three rules from module 11.2 are enforced by these components rather than by
 * whoever writes the screen:
 *
 *  1. `unavailable` is rendered as itself, never as zero. A zero that means "we
 *     could not compute this" is a number somebody will act on.
 *  2. Every figure carries its DENOMINATOR. A ratio without what it was measured
 *     against is a rumour, so `basis` is required, not decorative.
 *  3. Every figure carries an `as of`. A five-minute-old cash position read as
 *     now is how a supplier gets paid twice.
 */

/** Mirrors `Figure<T>` from modules/analytics/queries. */
export type Figure<T> = { value: T; unavailable?: never } | { value?: never; unavailable: string }

export interface AsOf {
  computedAt: string
  ageSeconds: number
  stale: boolean
}

function AsOfLine({ asOf }: { asOf: AsOf | { unavailable: string } | null }) {
  if (!asOf) return null

  if ('unavailable' in asOf) {
    return (
      <span style={{ font: "400 11px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        freshness unknown — {asOf.unavailable}
      </span>
    )
  }

  return (
    <span
      style={{
        font: "400 11px/1.4 var(--fx-font-mono)",
        // Stale is a warning, never amber: amber means a person must act.
        color: asOf.stale ? 'var(--fx-warning)' : 'var(--fx-text-tertiary)',
      }}
    >
      as of {asOf.computedAt}
      {asOf.stale ? ' · stale' : ''}
    </span>
  )
}

/**
 * One headline number.
 *
 * `basis` says what the figure was computed FROM, in the factory's own terms —
 * "19 of 22 shipments left on the ex-factory date", not "86%".
 */
export function FigureTile({
  label,
  figure,
  unit,
  basis,
  source,
  asOf,
  tone = 'neutral',
}: {
  label: ReactNode
  figure: Figure<string | number>
  unit?: string
  /** The denominator, in words. Required — see rule 2. */
  basis: ReactNode
  /** How it was computed, for somebody who wants to argue with it. */
  source?: ReactNode
  asOf?: AsOf | { unavailable: string } | null
  tone?: 'neutral' | 'good' | 'warning' | 'danger'
}) {
  const colour =
    tone === 'good'
      ? 'var(--fx-success)'
      : tone === 'warning'
        ? 'var(--fx-warning)'
        : tone === 'danger'
          ? 'var(--fx-danger)'
          : 'var(--fx-text-primary)'

  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
      }}
    >
      <Eyebrow>{label}</Eyebrow>

      {'unavailable' in figure ? (
        /* Not a zero, not a dash — the reason, in the space the number would
           have occupied, so it is impossible to read past. */
        <div
          style={{
            font: "500 15px/1.35 var(--fx-font-sans)",
            color: 'var(--fx-text-tertiary)',
            textWrap: 'pretty',
          }}
        >
          unavailable — {figure.unavailable}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            data-numeric
            style={{
              font: "600 34px/1.05 var(--fx-font-sans)",
              letterSpacing: '-.02em',
              color: colour,
            }}
          >
            {figure.value}
          </span>
          {unit ? (
            <span style={{ font: "400 14px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
              {unit}
            </span>
          ) : null}
        </div>
      )}

      <div style={{ font: "400 13px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
        {basis}
      </div>

      {source ? (
        <div style={{ font: "400 11.5px/1.45 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          {source}
        </div>
      ) : null}

      <AsOfLine asOf={asOf ?? null} />
    </div>
  )
}

/**
 * One thing that is wrong right now.
 *
 * `since` is preserved rather than recomputed on read: an exception that has
 * been true for nine days must keep saying nine days even after the feed
 * refreshes, otherwise every refresh makes the backlog look new.
 */
export function ExceptionRow({
  kind,
  reference,
  truth,
  because,
  age,
  severity,
  action,
}: {
  kind: ReactNode
  reference: ReactNode
  /** One sentence: what is true, and what it costs. */
  truth: ReactNode
  /** The detail somebody needs before deciding. */
  because?: ReactNode
  age: ReactNode
  severity: 'low' | 'medium' | 'high'
  action?: ReactNode
}) {
  const status = severity === 'high' ? 'late' : severity === 'medium' ? 'at-risk' : 'on-track'

  return (
    <div
      className="fx-selvage"
      data-status={status}
      data-critical={severity === 'high' || undefined}
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
      }}
    >
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Eyebrow>{kind}</Eyebrow>
          <span data-mono style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}>
            {reference}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              font: "500 12px/1 var(--fx-font-mono)",
              color: severity === 'high' ? 'var(--fx-danger)' : 'var(--fx-text-tertiary)',
            }}
          >
            {age}
          </span>
        </div>

        <div
          style={{
            font: "500 15px/1.45 var(--fx-font-sans)",
            color: 'var(--fx-text-primary)',
            textWrap: 'pretty',
          }}
        >
          {truth}
        </div>

        {because ? (
          <div
            style={{
              font: "400 13.5px/1.55 var(--fx-font-sans)",
              color: 'var(--fx-text-secondary)',
              textWrap: 'pretty',
            }}
          >
            {because}
          </div>
        ) : null}

        {action ? <div style={{ display: 'flex', gap: 9, paddingTop: 2 }}>{action}</div> : null}
      </div>
    </div>
  )
}

/**
 * What the feed actually looked at.
 *
 * An exception kind that was never scanned is not an absence of problems, and a
 * dashboard that silently omits it is worse than one that says it skipped it.
 */
export function CoverageNote({ coverage }: { coverage: Readonly<Record<string, boolean>> }) {
  const missing = Object.entries(coverage)
    .filter(([, scanned]) => !scanned)
    .map(([kind]) => kind.replace(/_/g, ' '))

  if (missing.length === 0) {
    return (
      <div style={{ font: "400 12px/1.5 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        every exception kind scanned
      </div>
    )
  }

  return (
    <div style={{ font: "400 12px/1.5 var(--fx-font-mono)", color: 'var(--fx-warning)' }}>
      not scanned: {missing.join(', ')} — absence here is not an absence of problems
    </div>
  )
}
