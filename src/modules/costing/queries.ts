/**
 * 1.5 read models.
 *
 * Cross-module reads go through here rather than through another module's tables
 * (CLAUDE.md rule 11). Costing owns `boms` and `bom_lines`; module 3.1 reads consumption
 * from this file and never touches those tables.
 *
 * Screen-shaped reads get added when HANDOFF-1.5 lands; what is here is the contract other
 * modules already depend on.
 */
import { desc, eq, and } from 'drizzle-orm'

import type { AnyCtx } from '../core/ctx'
import { notFound } from '../core/errors'
import { withTenantRead } from '../core/tenancy'

import { bomLines, boms, costSheets } from './schema'

export interface RequisitionConsumptionLine {
  itemRef: string
  /** At the BOM's own precision — four places. The caller rounds the RESULT, not this. */
  consumptionPerPiece: string
  unit: string
  wastagePct: string
}

/**
 * What one garment consumes, for sizing an order's requisition (brief §Feeds → 1.3/3.1).
 *
 * Returns consumption at full BOM precision deliberately. Rounding here would lose
 * 2.3 metres per thousand garments on a 1.4523 m consumption — the caller multiplies by
 * the order quantity first and rounds once at the end.
 */
export async function getRequisitionConsumption(
  ctx: AnyCtx,
  bomId: string,
): Promise<RequisitionConsumptionLine[]> {
  return withTenantRead(ctx, async (tx) => {
    const lines = await tx.select().from(bomLines).where(eq(bomLines.bomId, bomId))
    if (lines.length === 0) throw notFound('costing.errors.bom_not_found', { bomId })

    return lines.map((line) => ({
      itemRef: line.itemRef ?? line.id,
      consumptionPerPiece: line.consumption,
      unit: line.uom,
      wastagePct: line.wastagePct,
    }))
  })
}

/** The BOM behind a style's live cost sheet — how 3.1 gets from an order to consumption. */
export async function getBomForStyle(
  ctx: AnyCtx,
  styleCode: string,
): Promise<{ bomId: string; sheetVersion: number }> {
  return withTenantRead(ctx, async (tx) => {
    const [sheet] = await tx
      .select()
      .from(costSheets)
      .where(and(eq(costSheets.styleCode, styleCode), eq(costSheets.status, 'approved')))
      .orderBy(desc(costSheets.version))
      .limit(1)

    if (!sheet?.bomId) {
      // An approved sheet with no BOM cannot size a requisition. Say which, rather than
      // returning an empty list that reads as "this style needs nothing".
      throw notFound('costing.errors.no_bom_for_style', { styleCode })
    }

    const [bom] = await tx.select().from(boms).where(eq(boms.id, sheet.bomId))
    if (!bom) throw notFound('costing.errors.bom_not_found', { bomId: sheet.bomId })

    return { bomId: bom.id, sheetVersion: sheet.version }
  })
}
