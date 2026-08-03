import type { ReactNode } from 'react'

import { Lockup, ThreadRule } from '@/components/fx/signature'

import { ThemeToggle } from './theme-toggle'

/**
 * The top bar and the page header.
 *
 * The page header closes with an accent thread rule — 2px strokes at 115°,
 * the counter-thread to the slash rule's 34° warp. It runs once per page,
 * directly under the h1 block, and it COUNTS AS the view's amber moment: a
 * header carrying a thread rule does not also get an amber primary button.
 * That is what `ownsAmber` reports to the screen below it.
 */

export function TopBar({
  account,
  companyName,
  actions,
}: {
  /**
   * The signed-in person, as a rendered element.
   *
   * A slot rather than name/role props: the menu is a client component (it signs out and
   * opens) and this header is not, so the shell passes it down already built rather than
   * becoming a client component itself to hold one button.
   */
  account: ReactNode
  companyName: string
  /**
   * Slot for shell-level controls — the MARBIM launcher lives here. A slot rather than a
   * prop for each one, so the shell chrome does not have to know what a copilot is.
   */
  actions?: ReactNode
}) {
  return (
    <header
      style={{
        height: 60,
        flexShrink: 0,
        borderBottom: '1px solid var(--fx-border-subtle)',
        background: 'var(--fx-bg-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '0 24px',
      }}
    >
      <Lockup height={26} />

      <span
        style={{
          font: "400 13px/1 var(--fx-font-mono)",
          color: 'var(--fx-text-tertiary)',
          paddingLeft: 4,
        }}
      >
        {companyName}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            font: "400 13px/1 var(--fx-font-sans)",
            color: 'var(--fx-text-tertiary)',
          }}
        >
          {/* ⌘K belongs to MARBIM ("⌘K anywhere", X.2 canvas), so this no longer claims it.
              Search has no handler yet either — advertising a shortcut that does nothing,
              for a feature that does nothing, twice over, is worse than a plain label. */}
          Search
        </span>
        {actions}
        <ThemeToggle />
        {account}
      </div>
    </header>
  )
}

export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
  /**
   * Pass false when the screen's amber moment belongs elsewhere — an animating
   * mark, or a single primary action further down. The rule permits one, not both.
   */
  ownsAmber = true,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  ownsAmber?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          {eyebrow ? (
            <div
              style={{
                font: "400 12px/1 var(--fx-font-mono)",
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <h1
            style={{
              font: "700 34px/1.15 var(--fx-font-sans)",
              letterSpacing: 'var(--fx-tracking-display)',
              margin: 0,
              color: 'var(--fx-text-primary)',
            }}
          >
            {title}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {meta ? (
            <span style={{ font: "400 13px/1.5 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}>
              {meta}
            </span>
          ) : null}
          {actions}
        </div>
      </div>
      <ThreadRule variant={ownsAmber ? 'accent' : 'muted'} />
    </div>
  )
}

/** The 1280px content column every desk screen sits in. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <main
      // Marks the page slot for the MARBIM panel's host desaturation — while the panel is
      // open the screen behind it is context, not content. The rule lives in theme.css
      // because the panel is a sibling of this element, not an ancestor.
      data-fx-host
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--fx-bg-canvas)',
        padding: '32px 48px 96px',
      }}
    >
      <div style={{ maxWidth: 'var(--fx-content-max)', margin: '0 auto' }}>{children}</div>
    </main>
  )
}
