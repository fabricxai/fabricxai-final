'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/modules/core/session'

import { upsertCompanyProfile } from './service'

/**
 * X.3 Settings write paths.
 *
 * The role gate lives in the service (`assertPolicyAdmin`), not here — editing
 * policy is the same privilege as the controls it governs, and a check that
 * only existed at the action boundary would be missed by every other caller.
 */

export async function saveCompanyProfile(input: unknown): Promise<{ companyId: string }> {
  const ctx = await requireRole(await headers(), 'owner', 'admin')
  const result = await upsertCompanyProfile(ctx, input)

  // factoryType decides which modules appear in the nav, so the whole shell has
  // to re-render, not just this screen.
  revalidatePath('/', 'layout')
  return result
}
