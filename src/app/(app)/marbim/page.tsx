import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'

import { marbimEntryFor } from '@/components/shell/marbim-context'
import { PageHeader } from '@/components/shell/page-shell'
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

  // Shared with the shell's slide-over, so the two surfaces cannot disagree about what a
  // given role may ask for. See `components/shell/marbim-context`.
  const entry = marbimEntryFor(ctx.roles)

  return (
    <>
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
    </>
  )
}
