import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import type { ProductionPolicy } from '@/modules/production/service'
import { getPolicy } from '@/modules/settings/service'
import { activeLines, board } from '@/modules/production/queries'

import { LineBoard } from './board-client'

/**
 * 6.1 Line Tracking ⚡.
 *
 * A floor screen: 56px rows, ≥48px targets, and every write goes through the
 * offline queue rather than straight to the server. A supervisor on a tablet
 * behind a concrete wall must never be blocked by a network they cannot fix.
 */
export const dynamic = 'force-dynamic'

/** A normal Bangladeshi sewing shift: 8 hours plus two of overtime. */
const SHIFT_HOURS = 10

export default async function LinesPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)
  const [rows, lines, policy] = await Promise.all([
    board(ctx, { producedOn: today, shiftHours: SHIFT_HOURS }),
    activeLines(ctx),
    getPolicy<ProductionPolicy>(ctx, 'production'),
  ])

  // Behind means MATERIALLY behind, against the company's own threshold.
  //
  // This used to be `variance < 0` — any shortfall at all. A sewing line finishes a few
  // pieces under target most days, so every line was flagged: the header read "6 behind
  // target" on a floor where one line was stopped and one was quietly at 82%, and the two
  // that mattered were indistinguishable from the four that did not.
  const threshold = Number(policy.behindTargetPct ?? '95')
  const behind = rows.filter(
    (r) => r.target > 0 && (r.actual / r.target) * 100 < threshold,
  ).length

  return (
    <>
      <PageHeader
        eyebrow={`Line tracking · ${today}`}
        title={rows.length === 0 ? 'No lines set up' : `${rows.length} lines`}
        meta={behind > 0 ? `${behind} behind target` : undefined}
        ownsAmber={false}
      />

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <Link
          href="/lines/endline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '10px 14px',
            borderRadius: 'var(--fx-radius-md)',
            border: '1px solid var(--fx-border-default)',
            font: "500 13px/1 var(--fx-font-sans)",
            color: 'var(--fx-text-secondary)',
            textDecoration: 'none',
          }}
        >
          Endline QC
        </Link>
        <Link
          href="/lines/hourly"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '10px 14px',
            borderRadius: 'var(--fx-radius-md)',
            border: '1px solid var(--fx-border-default)',
            font: "500 13px/1 var(--fx-font-sans)",
            color: 'var(--fx-text-secondary)',
            textDecoration: 'none',
          }}
        >
          Enter this hour
        </Link>
        {/* Opens outside the app shell — the wall board has no navigation, so the only way
            back is the browser. A new tab is the honest affordance, and it is also how this
            gets left running on the pillar screen. */}
        <a
          href="/board"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '10px 14px',
            borderRadius: 'var(--fx-radius-md)',
            border: '1px solid var(--fx-border-default)',
            font: "500 13px/1 var(--fx-font-sans)",
            color: 'var(--fx-text-secondary)',
            textDecoration: 'none',
          }}
        >
          Wall board ↗
        </a>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="No production lines yet"
          body="Lines are set up on the planning board. Once they exist, this screen is where the hourly count goes in — on the floor, on a tablet, with or without a network."
        />
      ) : (
        <LineBoard rows={rows} lines={lines} producedOn={today} shiftHours={SHIFT_HOURS} />
      )}
    </>
  )
}
