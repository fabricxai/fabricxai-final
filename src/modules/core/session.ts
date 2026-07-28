/**
 * Session → `ctx` (dev-plan §2.2.1, PLAYBOOK §1 session 2).
 *
 * This is where authentication becomes tenancy. Every action and route handler starts
 * here, and nothing below it ever reads the session again — a service must be callable
 * from a BullMQ job, where there is no session at all.
 *
 * `companyId` comes from `session.activeOrganizationId` and roles are read from the
 * database on each request. Neither is ever taken from the client: a request that could
 * name its own company or its own role is not multi-tenant, it is multi-tenant-shaped.
 */
import { and, eq, isNull } from 'drizzle-orm'

import { roles as rolesTable } from '@/db/schema/core'
import { auth } from '@/lib/auth'

import type { RequestCtx, Role, SystemCtx } from './ctx'
import { AppError, forbidden } from './errors'
import { withTenantRead } from './tenancy'

/**
 * Build a ctx from request headers, or return null when unauthenticated.
 * Returns null rather than throwing so callers can distinguish "no session" (401) from
 * "session but wrong role" (403) without exception juggling.
 */
export async function getCtx(headers: Headers): Promise<RequestCtx | null> {
  const result = await auth.api.getSession({ headers })
  if (!result?.session || !result.user) return null

  const companyId = result.session.activeOrganizationId
  // Authenticated but with no company bound. Every downstream service requires a scope,
  // so this is treated as no context at all rather than a half-usable one.
  if (!companyId) return null

  // Scoped: the session already names the company, so this is an ordinary tenant read
  // and RLS confirms the membership belongs to that company. Only the pre-session
  // lookup in `membershipsForUser` needs the SECURITY DEFINER path.
  const memberships = await withTenantRead({ companyId, userId: result.user.id, roles: [] }, (tx) =>
    tx
      .select({ role: rolesTable.role })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.companyId, companyId),
          eq(rolesTable.userId, result.user.id),
          isNull(rolesTable.revokedAt),
        ),
      ),
  )

  // A session pointing at a company the user has been removed from. Revocation has to
  // take effect on the next request, not on the next login.
  if (memberships.length === 0) return null

  return {
    companyId,
    userId: result.user.id,
    roles: memberships.map((m) => m.role),
    requestId: headers.get('x-request-id') ?? undefined,
    ipAddress: headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
    locale: headers.get('accept-language')?.split(',')[0]?.trim() ?? undefined,
  }
}

/** Same, but throws the typed 401 an action boundary should return. */
export async function requireCtx(headers: Headers): Promise<RequestCtx> {
  const ctx = await getCtx(headers)
  if (!ctx) throw new AppError('unauthenticated', 'errors.unauthenticated')
  return ctx
}

/**
 * Role gate for the action boundary. Payroll (🔒) additionally returns a bodyless 403 —
 * that lives with module 10.1, since the shape of the refusal is part of its contract.
 */
export async function requireRole(
  headers: Headers,
  ...allowed: readonly Role[]
): Promise<RequestCtx> {
  const ctx = await requireCtx(headers)
  if (!allowed.some((role) => ctx.roles.includes(role))) {
    throw forbidden('errors.forbidden', { required: allowed })
  }
  return ctx
}

/**
 * Context for work with no human caller: outbox relay, scheduled derivations, seeds.
 * Still company-scoped — a job runs inside exactly one tenant at a time, so RLS binds it
 * the same way it binds a request.
 */
export function systemCtx(companyId: string, jobId?: string): SystemCtx {
  return { companyId, userId: null, roles: ['owner'], system: true, jobId }
}
