/**
 * The request context every service function takes as its first argument.
 * Built once at the action/route boundary from the Better Auth session, then threaded
 * down. Nothing below the boundary reads the session again — a service must be
 * callable from a BullMQ job, where there is no session at all.
 */
import type { roleNameEnum } from '@/db/schema/core'

export type Role = (typeof roleNameEnum.enumValues)[number]

export interface RequestCtx {
  readonly companyId: string
  readonly userId: string
  /** Every role the caller holds in this company. */
  readonly roles: readonly Role[]
  /** Correlates audit_log rows, Sentry events and logs for one request. */
  readonly requestId?: string
  readonly ipAddress?: string
  readonly userAgent?: string
  readonly locale?: string
}

/**
 * Context for work with no human caller: outbox relay, scheduled derivations, seeds.
 * Still company-scoped — a job runs inside exactly one tenant at a time, so RLS binds
 * it the same way it binds a request.
 */
export interface SystemCtx {
  readonly companyId: string
  readonly userId: null
  readonly roles: readonly Role[]
  readonly system: true
  readonly jobId?: string
}

export type AnyCtx = RequestCtx | SystemCtx

export const isSystemCtx = (ctx: AnyCtx): ctx is SystemCtx => 'system' in ctx

export const hasRole = (ctx: AnyCtx, ...roles: readonly Role[]): boolean =>
  roles.some((role) => ctx.roles.includes(role))
