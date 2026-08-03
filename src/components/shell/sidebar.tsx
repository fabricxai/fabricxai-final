'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { NAV_SECTIONS, type NavItem, type NavSection } from './nav'

/**
 * The sidebar. The active item is marked by a 2px amber slash at the wordmark's
 * 34° plus a bg-selected wash — an active indicator, which the amber rule
 * sanctions, and under 24px so it does not consume the view's amber moment.
 */
export function Sidebar({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname()

  const bySection = NAV_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((i) => i.section === section.id),
  })).filter((s) => s.items.length > 0)

  return (
    <nav
      aria-label="Modules"
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: '1px solid var(--fx-border-subtle)',
        background: 'var(--fx-bg-surface)',
        padding: '20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        overflowY: 'auto',
      }}
    >
      {bySection.map((section) => (
        <div key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              font: "500 11px/1 var(--fx-font-mono)",
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              color: 'var(--fx-text-tertiary)',
              padding: '0 12px 8px',
            }}
          >
            {section.label}
          </div>
          {section.items.map((item) => (
            <SidebarLink
              key={item.id}
              item={item}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        minHeight: 'var(--fx-tap-min)',
        borderRadius: 'var(--fx-radius-md)',
        font: "500 14px/1.2 var(--fx-font-sans)",
        textDecoration: 'none',
        background: active ? 'var(--fx-bg-selected)' : 'transparent',
        color: active ? 'var(--fx-text-primary)' : 'var(--fx-text-secondary)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 2,
          height: 15,
          flexShrink: 0,
          transform: 'skewX(var(--fx-slash-angle))',
          background: active ? 'var(--fx-accent)' : 'transparent',
        }}
      />
      {item.label}
    </Link>
  )
}

/** Section id → label, used by the top bar breadcrumb. */
export function sectionLabel(id: NavSection): string {
  return NAV_SECTIONS.find((s) => s.id === id)?.label ?? ''
}
