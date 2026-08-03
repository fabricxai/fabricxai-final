import type { CSSProperties, ReactNode } from 'react'

/**
 * The remaining three signature elements, plus the brand lockup.
 *
 * House rule from the design system: at least one signature element per screen,
 * never all four in the same viewport.
 */

/* ── 2. The slash rule ────────────────────────────────────
   Three 2px strokes at the wordmark's 34°, replacing horizontal rules at
   section boundaries. Amber only when it is the view's one amber moment. */

export function SlashRule({
  accent = false,
  height = 14,
  count = 3,
}: {
  accent?: boolean
  height?: number
  count?: number
}) {
  return (
    <span className="fx-slash-rule" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            height,
            background: accent ? 'var(--fx-accent)' : 'var(--fx-border-default)',
          }}
        />
      ))}
    </span>
  )
}

/**
 * The same strokes used as the progress bar — they fill left to right.
 * This is the system's progress bar; there is no circular spinner anywhere.
 */
export function SlashProgress({
  value,
  ticks = 22,
  label,
}: {
  /** 0–1 */
  value: number
  ticks?: number
  label?: string
}) {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * ticks)
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {label ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            font: "400 12px/1 var(--fx-font-mono)",
            color: 'var(--fx-text-tertiary)',
          }}
        >
          <span>{label}</span>
          <span data-numeric>{pct}%</span>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 5, height: 20, alignItems: 'center', overflow: 'hidden' }}>
        {Array.from({ length: ticks }, (_, i) => (
          <span
            key={i}
            style={{
              width: 2,
              height: 16,
              flexShrink: 0,
              transform: 'skewX(var(--fx-slash-angle))',
              background: i < filled ? 'var(--fx-accent)' : 'var(--fx-border-default)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── 3. The weave field ───────────────────────────────────
   A 34° hatch at 3–5%. Empty states, auth washes, card backs, scrims.
   Never behind body copy or data tables; one per screen, max 40vh. */

export function WeaveField({
  children,
  style,
  className,
}: {
  children?: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div className={['fx-weave', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}

/* ── Addendum 06. The thread rule ─────────────────────────
   2px strokes at 115° — the counter-thread to the slash rule's 34° warp.
   The accent variant closes a page header once per page, and it counts as
   that view's amber moment. The muted variant may repeat inside cards. */

export function ThreadRule({ variant = 'accent' }: { variant?: 'accent' | 'muted' }) {
  return <div className="fx-thread-rule" data-variant={variant} aria-hidden="true" />
}

/* ── Addendum 05. The selvage edge ────────────────────────
   A 3px status stripe on the left rim, 5px for the critical path. The surface
   stays neutral so a wall of rows stays readable. Never amber — the selvage is
   a verdict, not an action — and colour never carries state alone, so every
   selvage repeats itself in a status column. */

export type SelvageStatus = 'on-track' | 'at-risk' | 'late' | 'done'

export function Selvage({
  status,
  critical = false,
  children,
  style,
  className,
}: {
  status: SelvageStatus
  /** A thicker stripe: this row moves the ship date. */
  critical?: boolean
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div
      className={['fx-selvage', className].filter(Boolean).join(' ')}
      data-status={status}
      data-critical={critical || undefined}
      style={style}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/** The mono-caps label that must accompany every selvage. */
export function StatusLabel({
  status,
  children,
}: {
  status: SelvageStatus
  children: ReactNode
}) {
  const colour: Record<SelvageStatus, string> = {
    'on-track': 'var(--fx-success)',
    'at-risk': 'var(--fx-warning)',
    late: 'var(--fx-danger)',
    done: 'var(--fx-text-tertiary)',
  }
  return (
    <span
      style={{
        font: "500 11px/1 var(--fx-font-mono)",
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        color: colour[status],
      }}
    >
      {children}
    </span>
  )
}

/* ── Brand lockup ─────────────────────────────────────────
   Clearspace 0.25× height, min width 120px. Never stretched: the explicit
   align-self guards against flex cross-axis stretch on the <img>. */

export function Lockup({ height = 32 }: { height?: number }) {
  // No `display` here on purpose. Which of the two variants is visible is decided by
  // `.fx-mark-ink` / `.fx-mark-white`, which read a custom property off the nearest
  // data-theme scope. An inline `display: block` outranks any stylesheet rule, so setting
  // it here showed BOTH logos side by side in every theme — the ink wordmark next to the
  // white one — rather than letting the scope pick.
  const style: CSSProperties = {
    height,
    width: 'auto',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    objectFit: 'contain',
  }
  // Plain <img> on purpose: both variants must be present in the markup so CSS
  // can pick one from the nearest data-theme scope. next/image renders a single
  // optimised source, which would force a client round-trip to decide the mode.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/fabricxai-logo-light.png" alt="FabricX AI" className="fx-mark-ink" style={style} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/fabricxai-logo-dark.png" alt="FabricX AI" className="fx-mark-white" style={style} />
    </>
  )
}

/* ── Section heading ──────────────────────────────────────
   The design system's recurring pattern: an amber slash cluster, then an h2. */

export function SectionHeading({
  children,
  eyebrow,
  action,
}: {
  children: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
      <SlashRule accent height={15} />
      <h2
        style={{
          font: "600 26px/1.15 var(--fx-font-sans)",
          letterSpacing: '-.012em',
          margin: 0,
          color: 'var(--fx-text-primary)',
        }}
      >
        {children}
      </h2>
      {eyebrow ? (
        <span
          style={{
            font: "500 11px/1 var(--fx-font-mono)",
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--fx-text-tertiary)',
            marginLeft: 'auto',
          }}
        >
          {eyebrow}
        </span>
      ) : null}
      {action ? <span style={{ marginLeft: eyebrow ? 0 : 'auto' }}>{action}</span> : null}
    </div>
  )
}

/** The mono, letterspaced, uppercase label used above every metric and group. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        font: "500 11px/1 var(--fx-font-mono)",
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--fx-text-tertiary)',
      }}
    >
      {children}
    </div>
  )
}
