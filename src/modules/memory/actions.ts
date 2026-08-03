'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

import { requireCtx } from '@/modules/core/session'

import { findSimilar, setOutcomeNote, type SimilarStyle } from './service'

/**
 * Save the merchandiser's close-out note (canvas P3).
 *
 * The note is the ONLY field a person may change after an outcome is compiled, and the
 * service enforces that: `assertOutcomePatch` refuses everything else. A margin somebody
 * tidied up after the fact is worse than having no memory at all — it is a wrong number
 * carrying the authority of a measurement.
 *
 * There is a seven-day window. After it the record closes, because a note written six
 * months later is a reconstruction, and the next quote would be built on it as though it
 * were an observation.
 */
export async function saveCloseOutNote(input: {
  orderId: string
  merchandiserNote: string
}): Promise<{ outcomeId: string }> {
  const ctx = await requireCtx(await headers())
  const result = await setOutcomeNote(ctx, input)

  revalidatePath('/memory')
  return result
}

/**
 * "Have we made this before?" (canvas P1/P4).
 *
 * Matches on the style fingerprint, and returns the closest few rather than everything
 * above a threshold — a panel that offers eleven near-matches is a panel a merchandiser
 * scrolls past. The amber sits on the top one only.
 *
 * Read-only. Using a match as a baseline is `memory.useAsBaseline`, which raises a pending
 * draft on the cost sheet rather than writing one — the whole point of the panel is that it
 * informs a quote, never authors it.
 */
export async function findSimilarStyles(input: {
  styleCode?: string
  attrs?: Record<string, unknown>
  k?: number
}): Promise<SimilarStyle[]> {
  const ctx = await requireCtx(await headers())
  return findSimilar(ctx, input)
}
