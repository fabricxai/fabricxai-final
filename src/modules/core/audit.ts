/**
 * Audit interceptor (⚖ tables) — dev-plan §2.2.7, CLAUDE.md rule 10.
 *
 * Writes before/after images into `audit_log` inside the SAME transaction as the change,
 * so an audited row can never be written without its audit trail. Payroll READS are
 * audited too (rule 9), which is why `recordRead` exists at all.
 *
 * The table is append-only by privilege, not by convention: migration 0002 grants the
 * application role SELECT and INSERT and nothing else, so even a bug cannot rewrite
 * history.
 */
import { auditLog } from '@/db/schema/core'

import { type AnyCtx, isSystemCtx, type Role } from './ctx'
import type { TenantDb } from './tenancy'

/** Tables registered as ⚖. Populated by each module's register.ts. */
const auditedTables = new Set<string>()

export const registerAuditedTables = (...tables: readonly string[]): void => {
  for (const table of tables) auditedTables.add(table)
}
export const isAudited = (table: string): boolean => auditedTables.has(table)
export const listAuditedTables = (): readonly string[] => [...auditedTables]
/** Test-only: the set is module-global, so suites must be able to reset it. */
export const __resetAuditedTables = (): void => auditedTables.clear()

export type AuditAction = 'insert' | 'update' | 'delete' | 'approve' | 'reject' | 'export'

export interface AuditEntry {
  action: AuditAction
  targetTable: string
  targetId?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  /** Set when this change came out of the approve loop — closes draft→reviewer→row. */
  pendingChangeId?: string
}

/**
 * Which fields actually changed. Cheap to index and enough for most audit screens,
 * without making the reader diff two jsonb blobs by eye.
 */
function changedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] | null {
  if (!before || !after) return null

  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed = [...keys].filter((key) => {
    const a = before[key]
    const b = after[key]
    if (a === b) return false
    // Values arrive as jsonb-shaped plain data; structural compare is correct here and
    // avoids reporting every field as changed on a round-trip.
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
  })

  return changed.length ? changed.sort() : []
}

/** The role the actor was acting under. Roles change; the record should not. */
function actingRole(ctx: AnyCtx): Role | null {
  return ctx.roles[0] ?? null
}

/**
 * Record a change to an audited table. Takes the caller's transaction — an audit row
 * that commits separately from the change it describes is worse than no audit row,
 * because it looks authoritative.
 */
export async function recordChange(ctx: AnyCtx, tx: TenantDb, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    companyId: ctx.companyId,
    actorUserId: isSystemCtx(ctx) ? null : ctx.userId,
    actorRole: actingRole(ctx),
    action: entry.action,
    targetTable: entry.targetTable,
    targetId: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    changedFields: changedFields(entry.before, entry.after),
    pendingChangeId: entry.pendingChangeId ?? null,
    requestId: isSystemCtx(ctx) ? (ctx.jobId ?? null) : (ctx.requestId ?? null),
    ipAddress: isSystemCtx(ctx) ? null : (ctx.ipAddress ?? null),
    userAgent: isSystemCtx(ctx) ? null : (ctx.userAgent ?? null),
  })
}

/**
 * Record a READ of sensitive data. Payroll (🔒) is the reason this exists: who looked at
 * whose wages, and when, is itself information worth keeping (CLAUDE.md rule 9).
 *
 * `scope` carries what was asked for — a month, a line, a worker — since a payroll read
 * is rarely one row.
 */
export async function recordRead(
  ctx: AnyCtx,
  tx: TenantDb,
  entry: { targetTable: string; targetId?: string; scope?: Record<string, unknown> },
): Promise<void> {
  await tx.insert(auditLog).values({
    companyId: ctx.companyId,
    actorUserId: isSystemCtx(ctx) ? null : ctx.userId,
    actorRole: actingRole(ctx),
    action: 'read',
    targetTable: entry.targetTable,
    targetId: entry.targetId ?? null,
    after: entry.scope ?? null,
    requestId: isSystemCtx(ctx) ? (ctx.jobId ?? null) : (ctx.requestId ?? null),
    ipAddress: isSystemCtx(ctx) ? null : (ctx.ipAddress ?? null),
    userAgent: isSystemCtx(ctx) ? null : (ctx.userAgent ?? null),
  })
}
