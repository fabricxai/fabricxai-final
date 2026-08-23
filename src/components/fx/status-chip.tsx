import type { SelvageStatus } from './signature'

/**
 * A status that says itself three ways at once — colour, shape, word.
 *
 * The selvage stripe and the small mono word survive a design review; they do not
 * survive a 10-hour day, a cheap monitor, glare, or colour-blindness. The design
 * canvas's legibility pass settled the rule this component carries: LOUD WHEN BAD,
 * quiet when fine. Late is a filled red triangle, at-risk a filled amber diamond —
 * unmissable in a 40-row scan — while on-track and done stay outline chips, because
 * a wall of green shouting "fine" is how people stop reading statuses at all.
 *
 * The shape is not decoration: it is the channel that still works in grayscale
 * print and for the one-in-twelve readers who do not see the difference between
 * amber and red.
 */

const SHAPES: Record<SelvageStatus, { d: string; filled: boolean }> = {
  late: { d: 'M5 1L9.5 9H.5z', filled: true },
  'at-risk': { d: 'M5 .5L9.5 5 5 9.5.5 5z', filled: true },
  'on-track': { d: 'M1.5 5.5l2.5 2.5L8.5 2.5', filled: false },
  done: { d: 'M1.5 5.5l2.5 2.5L8.5 2.5', filled: false },
}

const STYLES: Record<SelvageStatus, { color: string; background: string; border: string }> = {
  late: { color: '#ffffff', background: 'var(--fx-danger)', border: 'transparent' },
  'at-risk': { color: '#ffffff', background: 'var(--fx-warning)', border: 'transparent' },
  'on-track': { color: 'var(--fx-success)', background: 'transparent', border: 'var(--fx-success)' },
  done: { color: 'var(--fx-text-tertiary)', background: 'transparent', border: 'var(--fx-border-default)' },
}

export function StatusChip({
  status,
  children,
}: {
  status: SelvageStatus
  /** The word. Required — a shape without a word is an icon quiz. */
  children: React.ReactNode
}) {
  const shape = SHAPES[status]
  const style = STYLES[status]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        font: '600 11px/1 var(--fx-font-mono)',
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        borderRadius: 'var(--fx-radius-sm)',
        padding: '5px 8px',
        whiteSpace: 'nowrap',
        color: style.color,
        background: style.background,
        border: `1px solid ${style.border}`,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ flexShrink: 0 }}>
        <path
          d={shape.d}
          fill={shape.filled ? 'currentColor' : 'none'}
          stroke={shape.filled ? 'none' : 'currentColor'}
          strokeWidth={shape.filled ? 0 : 1.8}
        />
      </svg>
      {children}
    </span>
  )
}
