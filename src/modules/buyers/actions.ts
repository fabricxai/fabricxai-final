'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireRole } from '@/modules/core/session'

import { convertLead, logActivity, setLeadStage } from './service'

/**
 * 1.1 Buyer & Lead Desk writes.
 *
 * Moving a lead to `lost` requires a reason. A pipeline that lets somebody drop
 * a lead without saying why produces a board full of dead rows and no answer to
 * "why are we losing" — and a 3% price loss and a 22% price loss are different
 * problems that a bare "lost" cannot distinguish.
 */

const stageInput = z
  .object({
    leadId: z.string().uuid(),
    stage: z.enum(['new', 'contacted', 'sampling_talk', 'negotiation', 'won', 'lost']),
    lostReason: z.string().min(1).max(300).optional(),
  })
  .refine((v) => v.stage !== 'lost' || !!v.lostReason, {
    message: 'a lost lead needs a reason',
    path: ['lostReason'],
  })

export async function moveLeadStage(input: z.input<typeof stageInput>): Promise<void> {
  const ctx = await requireRole(await headers(), 'merchandiser', 'commercial')
  const parsed = stageInput.parse(input)

  await setLeadStage(ctx, parsed)
  revalidatePath('/buyers')
}

export async function logLeadActivity(input: unknown): Promise<{ activityId: string }> {
  const ctx = await requireRole(await headers(), 'merchandiser', 'commercial')
  const result = await logActivity(ctx, input)

  // The quiet-lead clock is driven by activity, so logging one changes the board.
  revalidatePath('/buyers')
  return result
}

const convertInput = z.object({
  leadId: z.string().uuid(),
  /** Buyer code — short, stable, and what every downstream document keys off. */
  code: z.string().min(1).max(20),
})

export async function convertLeadToBuyer(input: z.input<typeof convertInput>) {
  const ctx = await requireRole(await headers(), 'merchandiser', 'commercial')
  const parsed = convertInput.parse(input)

  const result = await convertLead(ctx, parsed)
  revalidatePath('/buyers')
  return result
}
