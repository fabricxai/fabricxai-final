import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'

import { marbimEntryFor } from '@/components/shell/marbim-context'
import { LockedState } from '@/components/fx/feedback'
import { PageHeader } from '@/components/shell/page-shell'
import { env } from '@/lib/env'
import { getCtx } from '@/modules/core/session'

import { MarbimSurface } from './surface-client'

/**
 * X.2 MARBIM — the assistant surface.
 *
 * Suggested prompts are chosen server-side from the caller's roles. A read-only
 * role gets read-only starting points and no draft tools at all: absent, not
 * disabled, so nobody learns what they are missing by finding it greyed out.
 */
export const dynamic = 'force-dynamic'

export default async function MarbimPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  /*
   * The copilot's off-switch, honoured (plan 6.1).
   *
   * `MARBIM_ENABLED` had zero runtime consumers, so with it off this screen opened and
   * every question hard-failed against a provider that was never registered. A factory
   * should be told the copilot is not available rather than shown one that does not work.
   */
  if (!env.MARBIM_ENABLED) return <LockedState what="MARBIM" />

  // Shared with the shell's slide-over, so the two surfaces cannot disagree about what a
  // given role may ask for. See `components/shell/marbim-context`.
  const entry = marbimEntryFor(ctx.roles)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Definite height (not only minHeight) so the flex:1 surface can grow and
        // dock the composer. Top bar 60 + PageBody top pad 32; leave a thin gap
        // above the main's bottom pad so the input sits near the viewport floor.
        height: 'calc(100dvh - 60px - 32px - 16px)',
        marginBottom: -80,
      }}
    >
      <PageHeader
        eyebrow="MARBIM"
        title="Ask about this factory"
        meta={entry.readOnly ? 'read-only role' : undefined}
        // The send button owns the amber on this screen.
        ownsAmber={false}
      />
      <MarbimSurface
        conversationId={randomUUID()}
        suggestions={entry.suggestions}
        packLabel={entry.packLabel}
        readOnly={entry.readOnly}
      />
    </div>
  )
}
