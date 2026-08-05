/**
 * The first tenancy wall: a `company_id` predicate in the query itself.
 *
 * CLAUDE.md rule 2 says the RLS session variable is "the second wall, never the only wall".
 * It was the only wall (audit BE-B1): across 466 query sites the repo carried eight
 * `company_id` predicates, all incidental. Everything else rested entirely on `SET LOCAL`
 * and the policies.
 *
 * That is not nothing — the boot assertion refuses a SUPERUSER/BYPASSRLS connection, and
 * the seed sweeps 134 RLS tables on every run demanding zero rows unscoped. But all three
 * of those protections share one failure mode: they are properties of the CONNECTION. A
 * table shipped without a policy, a `SET LOCAL` that did not take on a recycled pooled
 * connection, a future read on a handle nobody scoped — each of those is invisible to all
 * of them, and each turns a `where id = $1` into another factory's row.
 *
 * A predicate in the SQL is a different kind of protection: it does not care how the
 * connection was made. Two independent walls fail independently, which is the whole point
 * of having two.
 *
 * **Adoption is a ratchet, not a rewrite.** Rewriting 466 sites in one pass would be a
 * large mechanical diff over money and payroll paths with no way to review it honestly.
 * Instead `eslint.config.mjs` enforces `require-tenant-predicate` on an explicit list of
 * adopted files: a file joins the list when its queries carry the predicate, and cannot
 * quietly leave. `docs/STUBS.md` carries what is still owed.
 */
import { and, eq, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { AnyCtx } from './ctx'

/**
 * A table that belongs to a tenant.
 *
 * Structural on purpose: passing a table with no `companyId` is a type error rather than a
 * predicate that silently compares undefined. The handful of genuinely install-wide tables
 * (`aql_tables`, the gazette reference data) cannot be passed here at all.
 */
export interface TenantTable {
  companyId: PgColumn
}

/** `company_id = <the caller's company>`, on its own. */
export function tenantEq(table: TenantTable, ctx: AnyCtx): SQL {
  return eq(table.companyId, ctx.companyId)
}

/**
 * The tenant predicate AND everything else this query filters on.
 *
 * Written so the company scope comes first and is impossible to read past:
 *
 *   .where(scoped(payrollRuns, ctx, eq(payrollRuns.id, runId)))
 *
 * `undefined` members are dropped, so a conditional filter can be passed inline without
 * the caller assembling an array first.
 */
export function scoped(
  table: TenantTable,
  ctx: AnyCtx,
  ...rest: readonly (SQL | undefined)[]
): SQL {
  // `and()` returns undefined only when every argument is undefined, and the tenant
  // predicate never is — so this cannot be a where-clause that filters nothing.
  return and(tenantEq(table, ctx), ...rest)!
}
