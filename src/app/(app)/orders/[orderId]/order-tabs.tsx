import Link from 'next/link'

/**
 * The order's five views, as the tab strip the design drew — not a row of buttons.
 *
 * A button row reads as actions; tabs read as places within one record, which is
 * what these are. The strip is shared by every sub-page so the set cannot drift:
 * a view added here appears on all five, and the active underline is the same
 * amber the section rule uses.
 */

const TABS = [
  { slug: '', label: 'Order' },
  { slug: 'documents', label: 'Style & documents' },
  { slug: 'drops', label: 'Drops & colours' },
  { slug: 'fabric', label: 'Fabric' },
  { slug: 'pack', label: 'Status pack' },
] as const

export type OrderTab = (typeof TABS)[number]['slug']

export function OrderTabs({ orderId, active }: { orderId: string; active: OrderTab }) {
  return (
    <div
      role="tablist"
      aria-label="Order views"
      style={{
        display: 'flex',
        gap: 26,
        borderBottom: '1px solid var(--fx-border-subtle)',
        marginBottom: 28,
        overflowX: 'auto',
      }}
    >
      {TABS.map((tab) => {
        const on = tab.slug === active
        return (
          <Link
            key={tab.slug}
            role="tab"
            aria-selected={on}
            href={`/orders/${orderId}${tab.slug ? `/${tab.slug}` : ''}`}
            style={{
              padding: '0 0 13px',
              font: '600 14px/1 var(--fx-font-sans)',
              marginBottom: -1,
              borderBottom: `2px solid ${on ? 'var(--fx-accent)' : 'transparent'}`,
              color: on ? 'var(--fx-text-primary)' : 'var(--fx-text-tertiary)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              minHeight: 'var(--fx-tap-min)',
              display: 'inline-flex',
              alignItems: 'flex-start',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
