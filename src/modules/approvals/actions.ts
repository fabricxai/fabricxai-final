'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  approve,
  currentRow,
  reject,
  type ApproveResult,
} from '@/modules/core/pending-changes'
import { requireCtx } from '@/modules/core/session'

import { draftDetail, draftTarget, type DraftDetail } from './queries'

/**
 * The Approve Inbox's two write paths.
 *
 * Thin by contract (CLAUDE.md rule 1): auth → zod → service. Neither of these
 * touches `db`; the transaction, the audit row and the outbox event all belong
 * to `core/pending-changes`, which is what keeps a commit atomic with its trail.
 */

const approveInput = z.object({
  pendingChangeId: z.string().uuid(),
  /**
   * Field edits the reviewer made before signing. This is the correction
   * telemetry the extractor is scored on, so it is captured at the moment of
   * approval rather than inferred later from a row diff.
   */
  corrections: z.record(z.string().min(1), z.unknown()).optional(),
  note: z.string().max(2000).optional(),
})

const rejectInput = z.object({
  pendingChangeId: z.string().uuid(),
  /** A rejection without a reason is a dead end for whoever drafted it. */
  reason: z.string().min(1).max(200),
  note: z.string().max(2000).optional(),
})

export async function approveDraft(input: z.input<typeof approveInput>): Promise<ApproveResult> {
  const ctx = await requireCtx(await headers())
  const parsed = approveInput.parse(input)

  const result = await approve(ctx, parsed)

  revalidatePath('/approve')
  return result
}

export async function rejectDraft(input: z.input<typeof rejectInput>): Promise<void> {
  const ctx = await requireCtx(await headers())
  const { pendingChangeId, reason, note } = rejectInput.parse(input)

  // The reason is the first line of the note so it survives into `review_note`,
  // which is what the drafter actually reads when the item comes back to them.
  await reject(ctx, pendingChangeId, note ? `${reason}\n\n${note}` : reason)

  revalidatePath('/approve')
}

/**
 * The fields a draft would write — what the reviewer is actually deciding on.
 *
 * The inbox listed a draft's module, target table, source, confidence and age, and never
 * the payload. So "insert on buyer requirements · confidence 0.62" was the whole of what
 * somebody approved: they could see the extractor was unsure and not what it was unsure
 * about. Per-field confidence only means something next to the field it belongs to.
 *
 * Fetched per row on expand rather than with the list. A fifty-draft inbox would otherwise
 * ship fifty payloads to the browser to render two, and payloads carry buyer prices and
 * wage rates — sending them to a screen nobody opened is a wider read than the reviewer
 * asked for.
 *
 * **The before comes from the row itself.** An insert has none — which is most of this
 * inbox — but an update showed only the incoming value, so a breakdown revision read as
 * "cells: Navy/L 2000" with no sign of the grid it replaces. `currentRow` is the same read
 * `approve` uses to capture `before` for the audit log, so what a reviewer signs is what
 * the trail records.
 */
export async function draftFields(input: { pendingChangeId: string }): Promise<DraftDetail | null> {
  const ctx = await requireCtx(await headers())
  const { pendingChangeId } = z.object({ pendingChangeId: z.string().uuid() }).parse(input)

  const draft = await draftTarget(ctx, pendingChangeId)
  if (!draft) return null

  const before = await currentRow(ctx, draft.targetTable, draft.targetId)

  return draftDetail(ctx, pendingChangeId, before)
}
