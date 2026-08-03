/**
 * Payloads for 1.5, including every `pending_changes` payload.
 *
 * A cost sheet's inputs are stored verbatim so the computation can be reproduced years
 * later, which makes this schema the actual contract — a field accepted loosely here is a
 * quote nobody can defend.
 */
import { z } from 'zod'

/**
 * A positive decimal string.
 *
 * `max` bounds the integer digits and `frac` the fractional ones. `frac` is a
 * parameter rather than a constant because a validator looser than its column
 * lets bad data in, and one TIGHTER than its column silently truncates good
 * data — an FX rate is the case that bites: BDT→USD is ~0.00837, so four
 * decimals can only say 0.0084 and puts a 0.4% error into every labour cost.
 */
export const decimal = (max = 12, frac = 4) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,${max}}(\\.\\d{1,${frac}})?$`), 'expected a positive decimal')

export const pct = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'expected a percentage')

export const materialLine = z.object({
  ref: z.string().min(1),
  consumption: decimal(),
  uom: z.string().min(1),
  ratePerUom: decimal(),
  wastagePct: pct.default('0'),
})

export const cmInput = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('smv'),
    smv: decimal(6),
    efficiencyPct: pct,
    labourRatePerMinuteLocal: decimal(8),
  }),
  z.object({ method: z.literal('per_dozen'), perDozenRateLocal: decimal(10) }),
])

export const costSheetSections = z.object({
  currency: z.string().length(3).default('USD'),
  localCurrency: z.string().length(3).default('BDT'),
  /** Snapshotted onto the sheet — there is no ambient exchange rate in this system. */
  // Matches `cost_sheets.fx_rate_local_to_base` — numeric(12, 6).
  fxRateLocalToBase: decimal(6, 6),
  fabric: z.array(materialLine).default([]),
  trims: z.array(materialLine).default([]),
  embellishment: z
    .array(z.object({ description: z.string().min(1), costPerPiece: decimal() }))
    .default([]),
  cm: cmInput,
  commercial: z
    .array(
      z.object({
        description: z.string().min(1),
        kind: z.enum(['pct_of_cost', 'per_piece']),
        value: decimal(),
      }),
    )
    .default([]),
  marginPct: pct,
  /**
   * Required, never defaulted. Margin on price and margin on cost differ by several
   * percent, and a default would make one of them silently wrong forever.
   */
  marginBasis: z.enum(['price', 'cost']),
})

export const createCostSheetPayload = z.object({
  styleCode: z.string().min(1),
  bomId: z.uuid().optional(),
  sections: costSheetSections,
})

export const scenarioOverrides = z.object({
  fabricRateMultiplier: decimal(6).optional(),
  efficiencyPct: pct.optional(),
  targetFobPrice: decimal().optional(),
})

/** What MARBIM extracts from a tech pack: the bill of materials, never the prices. */
export const bomFromTechPackDraft = z.object({
  styleCode: z.string().min(1),
  sourceDocumentId: z.uuid().optional(),
  lines: z
    .array(
      z.object({
        lineGroup: z.enum(['fabric', 'trims', 'packing', 'embellishment']),
        itemRef: z.string().optional(),
        spec: z.string().optional(),
        consumption: decimal(),
        uom: z.string().min(1),
        wastagePct: pct.default('0'),
        sourcePage: z.number().int().positive().optional(),
      }),
    )
    .min(1),
})

/**
 * What 1.6 Order Memory seeds from a past order: the same shape of bill of materials, with
 * every line saying whether its consumption was MEASURED on that order or copied from its
 * estimate.
 *
 * `fromOrderId` is required and is what distinguishes this payload from the tech-pack one at
 * commit time. It is also the answer to the only question a reviewer will have about these
 * numbers — which order they came off.
 */
export const bomSeededFromOrderDraft = z.object({
  styleCode: z.string().min(1),
  fromOrderId: z.uuid(),
  lines: z
    .array(
      z.object({
        lineGroup: z.enum(['fabric', 'trims', 'packing', 'embellishment']),
        itemRef: z.string().optional(),
        spec: z.string().optional(),
        consumption: decimal(),
        uom: z.string().min(1),
        wastagePct: pct.default('0'),
        /**
         * Never defaulted. A seeded line that fell back to the old estimate because nothing
         * was issued against it is not a measurement, and defaulting this to 'actual' would
         * be the single most misleading thing this module could do.
         */
        consumptionBasis: z.enum(['planned', 'actual']),
      }),
    )
    .min(1),
})

/**
 * A bill of materials somebody types, rather than one extracted or seeded.
 *
 * No `consumptionBasis` field, and its absence is the point: a hand-entered consumption is
 * an estimate. Offering the choice would let somebody mark a guess as `actual`, and `actual`
 * is what 1.6 Order Memory reads as a measured fact from a real order. The commit writes
 * every manual line as `planned`.
 */
export const manualBomPayload = z.object({
  styleCode: z.string().min(1),
  lines: z
    .array(
      z.object({
        lineGroup: z.enum(['fabric', 'trims', 'packing', 'embellishment']),
        itemRef: z.string().optional(),
        spec: z.string().optional(),
        consumption: decimal(),
        uom: z.string().min(1),
        wastagePct: pct.default('0'),
      }),
    )
    .min(1)
    .refine((lines) => lines.every((l) => l.itemRef || l.spec), {
      // A line that names neither an item nor a spec cannot be priced or requisitioned —
      // it is a row that says "something goes here".
      message: 'every line needs an item code or a written spec',
    }),
})

export const COSTING_ZOD_MAP = {
  bom_from_tech_pack_v1: bomFromTechPackDraft,
  bom_seeded_from_order_v1: bomSeededFromOrderDraft,
} as const

export type CreateCostSheetPayload = z.infer<typeof createCostSheetPayload>
