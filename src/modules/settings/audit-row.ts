import type { auditTrail } from './service'

/**
 * The audit trail row, in the only shape the screen is ever handed.
 *
 * This module exists because there were two producers of that shape and they drifted. The
 * settings page mapped its first page of rows and called `.toISOString()`; the filter
 * action returned the query's rows untouched. `occurred_at` is a `timestamptz`, so drizzle
 * hands back a `Date` — and a `Date` crosses the server-action boundary as a `Date`, not
 * as a string. So the screen rendered correctly on load and threw
 * "occurredAt.slice is not a function" the moment somebody chose a table filter. A cast in
 * the client (`as unknown as AuditRow[]`) is what let the two disagree in silence.
 *
 * It lives outside `actions.ts` because a `'use server'` module may only export async
 * functions — a plain mapper cannot live there — and outside the component because the
 * server page needs it too. One function, both callers, nothing left to drift.
 */
export interface AuditTrailRow {
  id: string
  actorUserId: string | null
  /** Resolved server-side. Null when the actor has left, or when there was no person at all. */
  actorName: string | null
  actorRole: string | null
  action: string
  targetTable: string
  targetId: string | null
  changedFields: string[] | null
  /** ISO 8601. A STRING, deliberately — see the note above. */
  occurredAt: string
}

/**
 * Project one row for the screen.
 *
 * Projected field by field, never spread. `audit_log` rows carry `before` and `after`
 * images, and this screen shows field NAMES precisely so that payroll values cannot be
 * read off it (rule 9). Spreading the row would ship those images to a browser that never
 * renders them, which is the same disclosure the screen is designed to refuse.
 */
export function serialiseAuditRow(
  row: Awaited<ReturnType<typeof auditTrail>>[number],
): AuditTrailRow {
  return {
    id: String(row.id),
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    action: String(row.action),
    targetTable: row.targetTable,
    targetId: row.targetId,
    changedFields: row.changedFields,
    occurredAt: row.occurredAt.toISOString(),
  }
}
