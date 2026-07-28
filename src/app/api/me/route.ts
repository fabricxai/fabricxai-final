import { NextResponse } from 'next/server'

import { getCtx } from '@/modules/core/session'

/**
 * The caller's resolved context. Small, but it is the first route in the codebase that
 * follows the real boundary rule — auth → ctx → response, no `db` access, no logic — and
 * it is what Phase 0 gate A asserts against: authentication is only useful once it has
 * become `{companyId, userId, roles}`.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const ctx = await getCtx(request.headers)

  if (!ctx) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 })
  }

  return NextResponse.json({
    userId: ctx.userId,
    companyId: ctx.companyId,
    roles: ctx.roles,
  })
}
