import Link from 'next/link'

/**
 * The morning digest — three sentences before the queues.
 *
 * A queue answers "what is waiting"; the digest answers "what changed and what needs
 * you first", which is the question a merchandiser actually opens the app with. The
 * sentences are COMPOSED, not generated: every clause is a fact already loaded for the
 * sections below, arranged worst-first, and a line with nothing true to say does not
 * appear. No model writes here — a morning brief that can hallucinate a date is worse
 * than no brief, and the one that cannot is just code.
 */

export interface DigestLine {
  id: string
  tone: 'late' | 'risk' | 'ok'
  text: string
  href: string
  ref: string
}

const TONE_COLOR: Record<DigestLine['tone'], string> = {
  late: 'var(--fx-danger)',
  risk: 'var(--fx-warning)',
  ok: 'var(--fx-success)',
}

const TONE_SHAPE: Record<DigestLine['tone'], string> = {
  // Shape + colour + position, never colour alone — the same rule as the selvage.
  late: 'M5 1L9.5 9H.5z',
  risk: 'M5 .5L9.5 5 5 9.5.5 5z',
  ok: 'M1.5 5.5l2.5 2.5L8.5 2.5',
}

export function MorningDigest({ lines, name }: { lines: readonly DigestLine[]; name: string | null }) {
  if (lines.length === 0) return null

  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
        padding: '18px 24px',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 28,
      }}
    >
      <span
        style={{
          font: '500 11px/1 var(--fx-font-mono)',
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--fx-text-tertiary)',
          paddingBottom: 10,
        }}
      >
        {name ? `Since you left, ${name}` : 'Since you left'} · from the nightly scan
      </span>

      {lines.map((line, i) => (
        <Link
          key={line.id}
          href={line.href}
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'baseline',
            padding: '10px 0',
            borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden
            style={{ flexShrink: 0, alignSelf: 'center', color: TONE_COLOR[line.tone] }}
          >
            <path
              d={TONE_SHAPE[line.tone]}
              fill={line.tone === 'ok' ? 'none' : 'currentColor'}
              stroke={line.tone === 'ok' ? 'currentColor' : 'none'}
              strokeWidth={line.tone === 'ok' ? 1.8 : 0}
            />
          </svg>
          <span style={{ font: '400 14px/1.55 var(--fx-font-sans)', minWidth: 0 }}>{line.text}</span>
          <span
            data-mono
            style={{
              marginLeft: 'auto',
              whiteSpace: 'nowrap',
              font: '400 12px/1.4 var(--fx-font-mono)',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            {line.ref}
          </span>
        </Link>
      ))}
    </div>
  )
}
