/**
 * 1.5 Costing Studio — service layer ⚖
 *
 * The gate that matters here is the margin floor. A sheet at or above the company's floor
 * is a manager's decision; below it, only the owner can sign. That is not a UI nicety —
 * quoting below the floor is how a factory books a year of work it loses money on, one
 * defensible-looking sheet at a time.
 *
 * Sheets are versioned and immutable once approved. Repricing creates version n+1 and
 * supersedes its predecessor; it never edits it, because the superseded sheet is what
 * some buyer was actually quoted.
 */
import { and, desc, eq } from 'drizzle-orm'

import { recordChange, registerAuditedTables } from '../core/audit'
import type { AnyCtx, RequestCtx } from '../core/ctx'
import { AppError, conflict, notFound } from '../core/errors'
import { emit } from '../core/outbox'
import { defineStateMachine } from '../core/state-machine'
import { withTenantRead, withTenantTx } from '../core/tenancy'

import {
  computeCostSheet,
  computeScenario,
  CostingError,
  type CostSheetInput,
  type CostSheetResult,
  type ScenarioOverrides,
} from './cost-sheet'
import { COSTING_EVENTS } from './events'
import { bomLines, boms, consumptionTemplates, costSheets } from './schema'
import { costSheetSections, createCostSheetPayload, scenarioOverrides } from './zod'

/** ⚖ — a cost sheet is the number a year of work is priced against. */
registerAuditedTables('cost_sheets')

/**
 * draft → approved → superseded. An approved sheet is never edited: it is what a buyer
 * was quoted, and repricing means a new version.
 */
export const costSheetMachine = defineStateMachine({
  field: 'status',
  initial: 'draft',
  transitions: {
    draft: ['approved', 'superseded'],
    approved: ['superseded'],
    superseded: [],
  },
})

export type CostSheetStatus = (typeof costSheetMachine.states)[number]

/** Company policy. Owned by Settings (X.3); passed in until that module exists. */
export interface CostingPolicy {
  marginFloorPct?: string
}

function toComputeInput(sections: unknown): CostSheetInput {
  const parsed = costSheetSections.parse(sections)
  return parsed as CostSheetInput
}

function wrapCostingError<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof CostingError) {
      // A malformed sheet is a 422 the merchandiser can act on, not a 500.
      throw new AppError('validation_failed', 'costing.errors.sheet_uncomputable', {
        reason: error.message,
      })
    }
    throw error
  }
}

/**
 * Assemble a draft sheet from a BOM (brief: `buildFromBom`).
 *
 * The BOM supplies consumption and wastage; prices do not come from it, because a bill of
 * materials is what the garment is made of and a cost sheet is what it costs today. The
 * caller supplies rates.
 */
export async function buildFromBom(
  ctx: RequestCtx,
  input: { bomId: string; rates: Record<string, string>; sections: unknown },
): Promise<{ sections: CostSheetInput }> {
  return withTenantRead(ctx, async (tx) => {
    const [bom] = await tx.select().from(boms).where(eq(boms.id, input.bomId))
    if (!bom) throw notFound('costing.errors.bom_not_found', { bomId: input.bomId })

    const lines = await tx.select().from(bomLines).where(eq(bomLines.bomId, input.bomId))
    const base = costSheetSections.parse(input.sections)

    const material = (group: 'fabric' | 'trims') =>
      lines
        .filter((line) => line.lineGroup === group)
        .map((line) => ({
          ref: line.itemRef ?? line.spec ?? line.id,
          consumption: line.consumption,
          uom: line.uom,
          // A line with no rate supplied is priced at zero and shows as zero — visible,
          // rather than quietly dropped out of the sheet.
          ratePerUom: input.rates[line.itemRef ?? line.id] ?? '0',
          wastagePct: line.wastagePct,
        }))

    return {
      sections: {
        ...base,
        fabric: material('fabric'),
        trims: material('trims'),
      } as CostSheetInput,
    }
  })
}

/** Compute without persisting — the live preview behind every slider. */
export async function previewCostSheet(
  ctx: AnyCtx,
  input: { sections: unknown; overrides?: unknown },
  policy: CostingPolicy = {},
): Promise<CostSheetResult> {
  const sections = toComputeInput(input.sections)
  const overrides = input.overrides
    ? (scenarioOverrides.parse(input.overrides) as ScenarioOverrides)
    : undefined

  void ctx
  return wrapCostingError(() =>
    overrides
      ? computeScenario(sections, overrides, policy)
      : computeCostSheet(sections, policy),
  )
}

/**
 * Create the next version of a sheet for a style.
 *
 * Versioning is per style and monotonic. The previous approved sheet is NOT superseded
 * here — that happens on approval, because a draft that never gets approved must not
 * invalidate the quote currently in force.
 */
export async function createCostSheet(
  ctx: RequestCtx,
  input: unknown,
  policy: CostingPolicy = {},
): Promise<{ sheetId: string; version: number; computed: CostSheetResult }> {
  const payload = createCostSheetPayload.parse(input)
  const sections = payload.sections as CostSheetInput
  const computed = wrapCostingError(() => computeCostSheet(sections, policy))

  return withTenantTx(ctx, async (tx) => {
    const [latest] = await tx
      .select({ version: costSheets.version })
      .from(costSheets)
      .where(eq(costSheets.styleCode, payload.styleCode))
      .orderBy(desc(costSheets.version))
      .limit(1)

    const version = (latest?.version ?? 0) + 1

    const [row] = await tx
      .insert(costSheets)
      .values({
        companyId: ctx.companyId,
        bomId: payload.bomId ?? null,
        styleCode: payload.styleCode,
        version,
        sections: sections as unknown as Record<string, unknown>,
        currency: sections.currency,
        localCurrency: sections.localCurrency,
        fxRateLocalToBase: sections.fxRateLocalToBase,
        totalCost: computed.totalCost,
        fobPrice: computed.fobPrice,
        cmLocalPerPiece: computed.sections.cm.localAmount ?? '0',
        marginPct: sections.marginPct,
        achievedMarginPct: computed.achievedMarginPct,
        createdBy: ctx.userId,
      })
      .returning({ id: costSheets.id })

    if (!row) throw new Error('cost_sheets insert returned nothing')

    await recordChange(ctx, tx, {
      action: 'insert',
      targetTable: 'cost_sheets',
      targetId: row.id,
      after: {
        styleCode: payload.styleCode,
        version,
        fobPrice: computed.fobPrice,
        achievedMarginPct: computed.achievedMarginPct,
      },
    })

    return { sheetId: row.id, version, computed }
  })
}

/**
 * Approve a sheet ⚖.
 *
 * **The gate**: at or above the company margin floor, a manager signs. Below it, only the
 * owner can. Enforced here rather than in the approval-routing config, because a floor
 * that lives only in `approval_rules` is a floor somebody can edit their way past.
 *
 * The figures are RECOMPUTED from the stored inputs before approving. A sheet whose
 * stored outputs no longer match its inputs has been tampered with or was written by an
 * older version of this code, and approving it would bless a number nobody can reproduce.
 */
export async function approveCostSheet(
  ctx: RequestCtx,
  input: { sheetId: string },
  policy: CostingPolicy = {},
): Promise<{ sheetId: string; version: number; belowFloor: boolean }> {
  return withTenantTx(ctx, async (tx) => {
    const [sheet] = await tx
      .select()
      .from(costSheets)
      .where(eq(costSheets.id, input.sheetId))
      .for('update')

    if (!sheet) throw notFound('costing.errors.sheet_not_found', { sheetId: input.sheetId })

    costSheetMachine.assert(sheet.status as CostSheetStatus, 'approved')

    const computed = wrapCostingError(() =>
      computeCostSheet(toComputeInput(sheet.sections), policy),
    )

    if (computed.fobPrice !== sheet.fobPrice || computed.totalCost !== sheet.totalCost) {
      // Stored outputs disagree with the stored inputs. Refuse rather than approve a
      // figure that cannot be reproduced.
      throw new AppError('conflict', 'costing.errors.sheet_stale', {
        storedFob: sheet.fobPrice,
        recomputedFob: computed.fobPrice,
      })
    }

    if (computed.belowMarginFloor && !ctx.roles.includes('owner')) {
      throw new AppError('forbidden', 'costing.errors.below_floor_needs_owner', {
        achievedMarginPct: computed.achievedMarginPct,
        floorPct: policy.marginFloorPct ?? null,
      })
    }

    // Supersede the sheet currently in force for this style — on APPROVAL, not on draft
    // creation, so an abandoned draft never invalidates a live quote.
    const superseded = await tx
      .update(costSheets)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(
        and(eq(costSheets.styleCode, sheet.styleCode), eq(costSheets.status, 'approved')),
      )
      .returning({ id: costSheets.id })

    await tx
      .update(costSheets)
      .set({
        status: 'approved',
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(costSheets.id, sheet.id))

    await recordChange(ctx, tx, {
      action: 'approve',
      targetTable: 'cost_sheets',
      targetId: sheet.id,
      before: { status: sheet.status },
      after: {
        status: 'approved',
        approvedBy: ctx.userId,
        belowFloor: computed.belowMarginFloor,
        supersededCount: superseded.length,
      },
    })

    await emit(ctx, tx, {
      eventName: COSTING_EVENTS.sheetApproved,
      payload: {
        sheetId: sheet.id,
        styleCode: sheet.styleCode,
        version: sheet.version,
        fobPrice: sheet.fobPrice,
        currency: sheet.currency,
      },
      aggregateTable: 'cost_sheets',
      aggregateId: sheet.id,
    })

    if (computed.belowMarginFloor) {
      // The owner knowingly signed below the floor. Worth its own event so the owner
      // digest and any later margin review both see it without digging.
      await emit(ctx, tx, {
        eventName: COSTING_EVENTS.belowFloorApproved,
        payload: {
          sheetId: sheet.id,
          styleCode: sheet.styleCode,
          achievedMarginPct: computed.achievedMarginPct,
          floorPct: policy.marginFloorPct ?? null,
          approvedBy: ctx.userId,
        },
        aggregateTable: 'cost_sheets',
        aggregateId: sheet.id,
      })
    }

    return { sheetId: sheet.id, version: sheet.version, belowFloor: computed.belowMarginFloor }
  })
}

/** The sheet currently in force for a style — what 1.2 quotes and 3.1 requisitions from. */
export async function getApprovedSheet(
  ctx: AnyCtx,
  styleCode: string,
): Promise<typeof costSheets.$inferSelect> {
  const sheet = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(costSheets)
      .where(and(eq(costSheets.styleCode, styleCode), eq(costSheets.status, 'approved')))
      .orderBy(desc(costSheets.version))
      .limit(1)
    return row
  })

  if (!sheet) throw notFound('costing.errors.no_approved_sheet', { styleCode })
  return sheet
}

/**
 * BOM consumption for an order's requisition (brief §Feeds → 1.3/3.1).
 *
 * This is what module 3.1 currently takes as caller input; routing it through here means
 * the requisition is sized from the same numbers the order was priced on.
 */
export async function getConsumptionForRequisition(
  ctx: AnyCtx,
  bomId: string,
): Promise<{ itemRef: string; consumptionPerPiece: string; unit: string; wastagePct: string }[]> {
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

/** Bump usage so the staleness report can tell a live template from a forgotten one. */
export async function touchTemplate(ctx: RequestCtx, productType: string): Promise<void> {
  await withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(consumptionTemplates)
      .where(eq(consumptionTemplates.productType, productType))

    if (!row) throw notFound('costing.errors.template_not_found', { productType })

    await tx
      .update(consumptionTemplates)
      .set({ usageCount: row.usageCount + 1, updatedAt: new Date() })
      .where(eq(consumptionTemplates.id, row.id))
  })
}

export { conflict }
