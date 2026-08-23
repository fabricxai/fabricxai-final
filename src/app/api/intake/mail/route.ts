import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { consume, LIMITS } from '@/lib/rate-limit'
import type { SystemCtx } from '@/modules/core/ctx'
import { AppError } from '@/modules/core/errors'
import { ingestMail } from '@/modules/marbim/service'

/**
 * The receiving end of mail intake (HANDOFF-marbim-mail-intake).
 *
 * An MTA adapter — or a curl — posts one mail here: sender, subject, attachments as
 * base64. MIME parsing stays on the adapter's side on purpose; RFC822 is a large
 * dependency for what a forwarding rule does in ten lines.
 *
 * Fail closed at every door: no token configured means the endpoint is dead, a wrong
 * token is indistinguishable from a dead endpoint (no oracle), and the tenant is the
 * ONE company the deployment names — multi-tenant mail routing is refused rather than
 * guessed, because a misrouted tech pack is a cross-tenant leak with a filename.
 */
export const dynamic = 'force-dynamic'

/**
 * The mail actor: a system ctx for the ONE configured tenant, by id rather than by
 * slug — the companies table is visible only from inside a company's own scope
 * (0002's policy), so there is no unprivileged way to look a slug up, and pulling
 * the BYPASSRLS connection into a public route to do it would be a worse trade than
 * asking ops for a uuid. A wrong id fails closed at the first insert: the documents
 * row's company FK has nothing to point at.
 */
function mailCtx(): SystemCtx | null {
  const companyId = env.INTAKE_MAIL_COMPANY_ID
  if (!companyId) return null
  return { companyId, userId: null, roles: [], system: true }
}

export async function POST(request: Request) {
  const token = env.INTAKE_MAIL_TOKEN
  const presented = request.headers.get('authorization')

  // One comparison, one answer. A missing token and a wrong one both 401 with the
  // same body — an attacker probing this endpoint learns nothing about its state.
  if (!token || presented !== `Bearer ${token}`) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 })
  }

  const limit = await consume('rl:intake-mail', LIMITS.documents)
  if (!limit.ok) {
    return NextResponse.json({ error: { code: 'rate_limited' } }, { status: 429 })
  }

  const ctx = mailCtx()
  if (!ctx) {
    return NextResponse.json(
      { error: { code: 'not_configured', message: 'INTAKE_MAIL_COMPANY_ID is not set' } },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 })
  }

  try {
    const result = await ingestMail(ctx, body)
    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { code: error.code, key: error.messageKey, details: error.details } },
        { status: 422 },
      )
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      return NextResponse.json({ error: { code: 'validation_failed' } }, { status: 422 })
    }
    throw error
  }
}
