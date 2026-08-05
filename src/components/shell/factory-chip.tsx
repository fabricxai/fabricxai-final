import Link from 'next/link'

/** Initials for the factory plate when no logo document is wired yet. */
export function factoryInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'FX'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

/**
 * Top-bar identity for the active factory.
 *
 * Bigger than a muted caption, boxed with a monogram plate (stand-in for the
 * logo until `logoDocumentId` is shown), and linked to `/factory` — the place
 * somebody goes to look at the unit, not to edit its policies.
 */
export function FactoryChip({ name }: { name: string }) {
  const initials = factoryInitials(name)

  return (
    <Link
      href="/factory"
      title={`${name} — factory`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: '100%',
        minWidth: 0,
        padding: '5px 12px 5px 5px',
        borderRadius: 'var(--fx-radius-md)',
        border: '1px solid var(--fx-border-default)',
        background: 'var(--fx-bg-sunken)',
        textDecoration: 'none',
        color: 'var(--fx-text-primary)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--fx-radius-sm)',
          background: 'var(--fx-text-primary)',
          color: 'var(--fx-text-inverse)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: '700 12px/1 var(--fx-font-sans)',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        {initials}
      </span>
      <span
        style={{
          font: '600 14px/1.2 var(--fx-font-sans)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {name}
      </span>
    </Link>
  )
}
