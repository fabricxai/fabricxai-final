/**
 * Tenancy, wall 1 (dev-plan §2.2.1, architecture §1.2).
 *
 * Every service function runs inside `withTenantTx`. It opens a transaction, sets
 * `app.company_id` for the duration of that transaction only, and hands back a scoped
 * handle. The RLS policies from migration 0002 then bound every statement inside it.
 *
 * **SET LOCAL, never SET.** PgBouncer runs in transaction mode: the server connection
 * returns to the pool at COMMIT and the next client — a different tenant — gets it. A
 * connection-level SET would scope their queries to the previous tenant's company. This
 * is the single most dangerous mistake available in this codebase, which is why the
 * scope is set through `set_config(..., is_local => true)` in one place and nowhere else.
 *
 * Fail-closed: with the setting absent, `app.current_company_id()` is NULL, every policy
 * predicate is NULL, and every query returns zero rows. A forgotten scope shows an empty
 * screen, never another factory's data.
 */
import { sql } from 'drizzle-orm'

import { db } from '@/db/client'

import type { AnyCtx } from './ctx'
import { AppError } from './errors'

/** The scoped handle passed to every service function. */
export type TenantDb = Parameters<Parameters<typeof db.transaction>[0]>[0]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The company id ends up inside a `set_config` call. It is always bound as a parameter,
 * never interpolated — but validating it here turns a malformed scope into a clear
 * error at the boundary instead of a cast failure deep inside a transaction.
 */
function assertScope(ctx: AnyCtx): string {
  if (!ctx.companyId || !UUID_RE.test(ctx.companyId)) {
    throw new AppError(
      'internal',
      'errors.invalid_tenant_scope',
      {},
      `withTenantTx called with an invalid companyId: ${String(ctx.companyId)}`,
    )
  }
  return ctx.companyId
}

/**
 * Run `fn` in one transaction scoped to `ctx.companyId`.
 * Everything a service does — reads, writes, the audit row, the outbox event — belongs
 * inside a single call, because that is what makes the event and the change atomic.
 */
export async function withTenantTx<T>(ctx: AnyCtx, fn: (tx: TenantDb) => Promise<T>): Promise<T> {
  const companyId = assertScope(ctx)

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`)
    return fn(tx)
  })
}

/**
 * Read-only variant. Same wall, plus `SET TRANSACTION READ ONLY` so an accidental write
 * on a read path fails at the database rather than succeeding quietly. Also the seam
 * where reads get routed to a replica later, without touching a single call site.
 */
export async function withTenantRead<T>(ctx: AnyCtx, fn: (tx: TenantDb) => Promise<T>): Promise<T> {
  const companyId = assertScope(ctx)

  return db.transaction(async (tx) => {
    // Must precede any data statement in the transaction.
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`)
    return fn(tx)
  })
}

/**
 * The caller's own company memberships, resolved before any tenant scope exists.
 *
 * Login is a chicken-and-egg — the scope comes from the membership, and the membership
 * lives in a scoped table. This goes through `app.memberships_for_user`, a
 * SECURITY DEFINER function that takes a user id and returns nothing else. It is the
 * only cross-tenant read in the system; see migration 0004 for why it is the least-bad
 * option and why it cannot be asked about anyone but its argument.
 */
export async function membershipsForUser(
  userId: string,
): Promise<{ companyId: string; role: string }[]> {
  const result = await db.execute<{ company_id: string; role: string }>(
    sql`select company_id, role from app.memberships_for_user(${userId})`,
  )
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return (rows as { company_id: string; role: string }[]).map((r) => ({
    companyId: r.company_id,
    role: r.role,
  }))
}
