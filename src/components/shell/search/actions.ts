'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import type { FactoryType } from '@/components/shell/nav'
import { requireCtx } from '@/modules/core/session'
import { companyProfile } from '@/modules/settings/service'

import { searchFactory } from './search'
import type { SearchHit } from './search-types'

const Query = z.object({
  query: z.string().trim().min(1).max(80),
})

/**
 * Top-bar search. Thin: auth → zod → searchFactory. Never touches db here.
 */
export async function runGlobalSearch(input: {
  query: string
}): Promise<{ hits: SearchHit[] } | { error: string }> {
  const parsed = Query.safeParse(input)
  if (!parsed.success) return { hits: [] }

  const ctx = await requireCtx(await headers())
  const profile = await companyProfile(ctx)
  const factoryType: FactoryType = profile?.factoryType ?? 'woven'

  const hits = await searchFactory(ctx, {
    query: parsed.data.query,
    factoryType,
  })
  return { hits }
}
