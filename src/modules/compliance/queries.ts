/**
 * Read models for compliance, for other modules to use.
 *
 * Rule 11: `audits` belongs to this module, so anything that needs to name an audit asks
 * here rather than reaching for the table. The first caller is MARBIM's document intake —
 * a findings list is always the findings OF an audit, and the report itself never says
 * which row in this system that is.
 */
import { desc, eq } from 'drizzle-orm'

import type { AnyCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'

import { audits, findings } from './schema'

export interface AuditOption {
  id: string
  regime: string
  auditor: string
  auditedOn: string
  /** How many findings are already recorded, so nobody files a second copy of a report. */
  findingCount: number
}

/**
 * Audits somebody might still be filing paperwork against, newest first.
 *
 * Not every audit ever run: an intake picker listing six years of audits makes choosing the
 * wrong one easy, and a findings batch on the wrong audit is a CAP against the wrong report.
 */
export async function recentAudits(ctx: AnyCtx, limit = 25): Promise<AuditOption[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: audits.id,
        regime: audits.regime,
        auditor: audits.auditor,
        auditedOn: audits.auditedOn,
        findingId: findings.id,
      })
      .from(audits)
      .leftJoin(findings, eq(findings.auditId, audits.id))
      .orderBy(desc(audits.auditedOn))

    // Grouped here rather than in SQL so the limit applies to audits, not to joined rows —
    // a `limit` on the joined select would cut an audit's findings in half and undercount.
    const byId = new Map<string, AuditOption>()
    for (const row of rows) {
      const existing = byId.get(row.id)
      if (existing) {
        if (row.findingId) existing.findingCount += 1
        continue
      }
      byId.set(row.id, {
        id: row.id,
        regime: row.regime,
        auditor: row.auditor,
        auditedOn: row.auditedOn,
        findingCount: row.findingId ? 1 : 0,
      })
    }

    return [...byId.values()].slice(0, limit)
  })
}
