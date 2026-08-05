'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import type { FactoryType } from '@/components/shell/nav'
import { consume, LIMITS } from '@/lib/rate-limit'
import { MIN_SEARCH_LENGTH } from '@/lib/search-text'
import { requireRole } from '@/modules/core/session'
import { companyProfile } from '@/modules/settings/service'

import { searchFactory } from './search'
import type { SearchHit } from './search-types'

/**
 * Three characters, not one.
 *
 * A single character fans out to six `ILIKE '%a%'` scans over unindexed text columns, per
 * debounced keystroke, and returns a result nobody wanted anyway. The floor for a useful
 * query and the floor for a cheap one are the same number here.
 */
const Query = z.object({
  query: z.string().trim().min(MIN_SEARCH_LENGTH).max(80),
})

/**
 * Top-bar search. Thin by contract: auth → role → rate limit → zod → the owners' reads.
 *
 * Every role in the nav may search, including `viewer` — searching is a read, and the
 * results are already filtered to what `canSee` would show that role. The gate is here so
 * that "every action names its roles" stays true of this file too (audit N1).
 */
export async function runGlobalSearch(input: {
  query: string
}): Promise<{ hits: SearchHit[] } | { error: string }> {
  const parsed = Query.safeParse(input)
  // Too short is not an error the user needs to read — it is the state of an empty box.
  if (!parsed.success) return { hits: [] }

  const ctx = await requireRole(
    await headers(),
    'merchandiser',
    'commercial',
    'planner',
    'store',
    'procurement',
    'cutting',
    'production',
    'quality',
    'shipment',
    'maintenance',
    'hr',
    'compliance',
    'finance',
    'member',
    'viewer',
  )

  // Fails open, like every other bucket: a Redis blip must not stop somebody finding an
  // order. It bounds the pathological case, it is not an authorisation.
  const limit = await consume(`rl:search:${ctx.userId}`, LIMITS.search)
  if (!limit.ok) return { hits: [] }

  const profile = await companyProfile(ctx)
  const factoryType: FactoryType = profile?.factoryType ?? 'woven'

  const hits = await searchFactory(ctx, { query: parsed.data.query, factoryType })
  return { hits }
}
