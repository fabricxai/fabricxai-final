/**
 * The company policy registry — X.3's reason to exist.
 *
 * Twelve modules take a `Policy` argument: costing's margin floor, cutting's tolerance,
 * planning's default efficiency, procurement's BTB limit, and so on. Until now every one was
 * supplied by whoever happened to be calling, which meant two call sites could judge the
 * same thing by different numbers — a quote approved against a 10% floor in one screen and
 * an 8% floor in another, with nothing to say which was the company's actual rule.
 *
 * This file is the single place those numbers live. It does NOT change the service
 * signatures, deliberately: services still receive their policy as an argument, which is
 * what keeps them testable without a database and keeps the dependency pointing one way
 * (a module never imports Settings). What changes is that the VALUE now comes from one
 * authoritative row instead of a literal at the call site.
 *
 * ## The compile-time contract
 *
 * Each entry declares a zod schema, and a `satisfies` check asserts the schema's output is
 * assignable to the module's own `Policy` interface. Add a required field to
 * `CuttingPolicy` and this file stops compiling until the schema and its default catch up —
 * which is the only way a registry of stored JSON stays honest against twelve interfaces
 * that evolve independently.
 */
import { z } from 'zod'

import type { ApprovalsPolicy } from '../approvals/service'
import type { BuyerDeskPolicy } from '../buyers/service'
import type { BankDocsPolicy } from '../commercial/service'
import type { CostingPolicy } from '../costing/service'
import type { CuttingPolicy } from '../cutting/service'
import type { FinancePolicy } from '../finance/service'
import type { PlanningPolicy } from '../planning/service'
import type { ProcurementPolicy } from '../procurement/service'
import type { QualityPolicy } from '../quality/service'
import type { RfqPolicy } from '../rfq/service'
import type { SamplingPolicy } from '../sampling/service'
import type { ShipmentPolicy } from '../shipment/service'

const pct = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'expected a percentage')
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'expected a positive decimal')
const wholeDays = z.number().int().min(0)

/**
 * A policy's schema and the value a factory gets before anybody configures anything.
 *
 * Every default here is a judgement, not a standard — the industry norms a Bangladeshi
 * export factory would recognise. They exist so a fresh company works, and each carries a
 * comment saying what it means, because a number nobody can explain gets changed by whoever
 * is most annoyed by it.
 */
export interface PolicyDefinition<T> {
  moduleId: string
  schema: z.ZodType<T>
  defaults: T
  /** What a settings screen shows above the fields. */
  label: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.5 Costing
// ─────────────────────────────────────────────────────────────────────────────

const costingSchema = z.object({
  /** Below this achieved margin, only the owner can approve a sheet. */
  marginFloorPct: pct.optional(),
})

const costing = {
  moduleId: 'costing',
  label: 'Costing Studio',
  schema: costingSchema,
  // 10% is a common floor for a Bangladeshi CM-plus-materials quote. A factory quoting
  // under it consistently is working for its buyers rather than for itself.
  defaults: { marginFloorPct: '10' },
} satisfies PolicyDefinition<CostingPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 4.1 Planning
// ─────────────────────────────────────────────────────────────────────────────

const planningSchema = z.object({
  /** Expected line efficiency when no learning curve applies. */
  defaultEfficiencyPct: pct.optional(),
  /** Shift length for a line-day with no calendar row. */
  defaultShiftMinutes: z.number().int().min(1).max(1440).optional(),
})

const planning = {
  moduleId: 'planning',
  label: 'Capacity & Line Planning',
  schema: planningSchema,
  // 60% is a realistic steady state for a Bangladeshi sewing line — planning at 100% is the
  // single most common way a factory over-commits. 480 minutes is one eight-hour shift.
  defaults: { defaultEfficiencyPct: '60', defaultShiftMinutes: 480 },
} satisfies PolicyDefinition<PlanningPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 5.1 Cutting
// ─────────────────────────────────────────────────────────────────────────────

const cuttingSchema = z.object({
  /** Cut-vs-breakdown tolerance per cell. Required — a default in the checker would be a
   *  silent allowance. */
  tolerancePct: pct,
  defaultBundleSize: z.number().int().min(1).optional(),
  /** Wastage past marker plan by more than this raises the anomaly alert. */
  wastageAlertPct: pct.optional(),
})

const cutting = {
  moduleId: 'cutting',
  label: 'Cutting Floor',
  schema: cuttingSchema,
  // Cutters cut a few extra so QC rejects can be replaced; 2% is the usual allowance.
  // Bundles of 20 are what a sewing line actually carries. 5% over the marker plan is
  // where wastage stops being normal end-bits.
  defaults: { tolerancePct: '2', defaultBundleSize: 20, wastageAlertPct: '5' },
} satisfies PolicyDefinition<CuttingPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 7.1 Quality
// ─────────────────────────────────────────────────────────────────────────────

const qualitySchema = z.object({
  aqlStandard: z.string().min(1),
  fabricMaxPointsPer100SqYd: decimal,
  dhuAlertThreshold: decimal.optional(),
  repeatDefectDays: z.number().int().min(2),
})

const quality = {
  moduleId: 'quality',
  label: 'Quality',
  schema: qualitySchema,
  // 40 points per 100 square yards is the industry acceptance limit for the 4-point system.
  // 5 DHU is where a line stops being merely imperfect. Three consecutive days is a
  // pattern rather than a bad shift.
  defaults: {
    aqlStandard: 'ansi-z1.4',
    fabricMaxPointsPer100SqYd: '40',
    dhuAlertThreshold: '5',
    repeatDefectDays: 3,
  },
} satisfies PolicyDefinition<QualityPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 3.2 Procurement
// ─────────────────────────────────────────────────────────────────────────────

const procurementSchema = z.object({
  /** BTB ceiling as a percentage of the master LC. */
  btbLimitPct: z.number().min(0).max(100).optional(),
  overReceiptTolerancePct: pct,
})

const procurement = {
  moduleId: 'procurement',
  label: 'Procurement & Suppliers',
  schema: procurementSchema,
  // 75% of the master LC is the usual bank ceiling for back-to-back credits. Mills cut to
  // the roll, not the metre, so 2% over on a receipt is a normal delivery.
  defaults: { btbLimitPct: 75, overReceiptTolerancePct: '2' },
} satisfies PolicyDefinition<ProcurementPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 2.1 Commercial bank docs
// ─────────────────────────────────────────────────────────────────────────────

const bankDocsSchema = z.object({
  discrepancyEscalateAfterDays: wholeDays,
  explainShortfallAbovePct: pct,
  btbLimitPct: z.number().min(0).max(100).optional(),
})

const commercial = {
  moduleId: 'commercial',
  label: 'LC Register & Bank Docs',
  schema: bankDocsSchema,
  // A discrepancy sitting five days is costing the factory its money at the bank's
  // convenience. Bank charges are typically well under 5% of an invoice; more than that is
  // a dispute or a discount and needs a written reason.
  defaults: { discrepancyEscalateAfterDays: 5, explainShortfallAbovePct: '5', btbLimitPct: 75 },
} satisfies PolicyDefinition<BankDocsPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 8.1 Shipment
// ─────────────────────────────────────────────────────────────────────────────

const shipmentSchema = z.object({
  /** Days a bank needs between shipment and document presentation. */
  presentationDays: wholeDays.optional(),
})

const shipment = {
  moduleId: 'shipment',
  label: 'Finishing, Cartons & Shipment',
  schema: shipmentSchema,
  // 21 days is the UCP default presentation period.
  defaults: { presentationDays: 21 },
} satisfies PolicyDefinition<ShipmentPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 11.1 Finance
// ─────────────────────────────────────────────────────────────────────────────

const financeSchema = z.object({
  /** Days to assume for a buyer with no realization history. Never zero. */
  defaultRealizationLagDays: wholeDays,
  marginErosionPct: pct.optional(),
  /** Loaded cost of one line-day, local currency. The CM allocation model v1. */
  loadedLineDayRate: decimal.optional(),
})

const finance = {
  moduleId: 'finance',
  label: 'Commercial Finance',
  schema: financeSchema,
  // Terms say 30 days and banks take longer; 30 is the honest starting assumption until a
  // buyer has history. Two points of margin erosion is worth an owner's attention.
  defaults: { defaultRealizationLagDays: 30, marginErosionPct: '2' },
} satisfies PolicyDefinition<FinancePolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 1.4 Sampling
// ─────────────────────────────────────────────────────────────────────────────

const samplingSchema = z.object({
  ppBlockingWindowDays: wholeDays,
})

const sampling = {
  moduleId: 'sampling',
  label: 'Sampling',
  schema: samplingSchema,
  // Five days before a planned cutting date is when an unapproved PP sample stops being a
  // reminder and starts being an idle line.
  defaults: { ppBlockingWindowDays: 5 },
} satisfies PolicyDefinition<SamplingPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 1.2 RFQ
// ─────────────────────────────────────────────────────────────────────────────

const rfqSchema = z.object({
  marginFloorPct: pct.optional(),
  deadlineNearHours: wholeDays,
  clarificationStaleDays: wholeDays,
})

const rfq = {
  moduleId: 'rfq',
  label: 'RFQ & Quotation',
  schema: rfqSchema,
  // The same floor as costing by default: a quote and the sheet behind it should not be
  // judged by different numbers. 48 hours before a deadline, and five days on an
  // unanswered question, are both from the brief.
  defaults: { marginFloorPct: '10', deadlineNearHours: 48, clarificationStaleDays: 5 },
} satisfies PolicyDefinition<RfqPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// 1.1 Buyer desk
// ─────────────────────────────────────────────────────────────────────────────

const buyersSchema = z.object({
  quietAfterDays: wholeDays,
  duplicateThreshold: z.number().min(0).max(1),
})

const buyers = {
  moduleId: 'buyers',
  label: 'Buyer Lead Desk',
  schema: buyersSchema,
  // Three weeks without contact is a lead going cold. 0.6 trigram similarity is the
  // threshold the brief names.
  defaults: { quietAfterDays: 21, duplicateThreshold: 0.6 },
} satisfies PolicyDefinition<BuyerDeskPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// X.1 Approvals
// ─────────────────────────────────────────────────────────────────────────────

const approvalsSchema = z.object({
  agingEscalateAfterHours: wholeDays,
})

const approvals = {
  moduleId: 'approvals',
  label: 'Approve Inbox',
  schema: approvalsSchema,
  // 48 hours, from the brief. A draft waiting longer is blocking whatever proposed it.
  defaults: { agingEscalateAfterHours: 48 },
} satisfies PolicyDefinition<ApprovalsPolicy>

// ─────────────────────────────────────────────────────────────────────────────
// The registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every configurable module.
 *
 * `unknown` in the value type rather than a union: each entry's own `satisfies` check above
 * already proved it conforms to its module's interface, and `getPolicy` casts back to the
 * caller's expected type. A union here would make every read need a discriminator for no
 * additional safety.
 */
export const POLICY_REGISTRY: Readonly<Record<string, PolicyDefinition<never>>> = {
  approvals,
  buyers,
  commercial,
  costing,
  cutting,
  finance,
  planning,
  procurement,
  quality,
  rfq,
  sampling,
  shipment,
} as unknown as Readonly<Record<string, PolicyDefinition<never>>>

export type PolicyModuleId = keyof typeof POLICY_REGISTRY

/** Every module that has configurable policy, for a settings screen's navigation. */
export const POLICY_MODULE_IDS = Object.keys(POLICY_REGISTRY).sort()

export class SettingsError extends Error {
  override readonly name = 'SettingsError'
}

/**
 * Merge a stored override onto a module's defaults and validate the result.
 *
 * A SHALLOW merge, deliberately: every policy is a flat bag of scalars, and a deep merge
 * would let a half-configured nested object look complete. A stored key the schema does not
 * know is dropped rather than passed through — a policy that has been renamed must not keep
 * feeding a service a field it no longer reads under a name nobody maintains.
 *
 * Validation happens AFTER the merge, so a stored value that is individually plausible but
 * invalid in combination still fails here rather than inside a service.
 */
export function resolvePolicyValue<T>(
  moduleId: string,
  stored: Record<string, unknown> | null | undefined,
): T {
  const definition = POLICY_REGISTRY[moduleId]
  if (!definition) {
    throw new SettingsError(`"${moduleId}" has no configurable policy`)
  }

  const defaults = definition.defaults as Record<string, unknown>
  const known = new Set(Object.keys(defaults))

  // Anything the schema knows about but the defaults omit is still configurable — an
  // optional field with no default is the normal case.
  const shape = (definition.schema as unknown as { shape?: Record<string, unknown> }).shape
  if (shape) for (const key of Object.keys(shape)) known.add(key)

  const merged: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(stored ?? {})) {
    if (!known.has(key)) continue
    // An explicit null means "fall back to the default" rather than "set to nothing".
    if (value === null || value === undefined) continue
    merged[key] = value
  }

  const parsed = definition.schema.safeParse(merged)
  if (!parsed.success) {
    throw new SettingsError(
      `stored ${moduleId} policy is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
        .join('; ')}`,
    )
  }

  return parsed.data as T
}

/** Validate a proposed patch before it is stored. Returns the value that would result. */
export function validatePolicyPatch<T>(
  moduleId: string,
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): { next: Record<string, unknown>; resolved: T } {
  const definition = POLICY_REGISTRY[moduleId]
  if (!definition) {
    throw new SettingsError(`"${moduleId}" has no configurable policy`)
  }

  const shape = (definition.schema as unknown as { shape?: Record<string, unknown> }).shape
  const known = new Set([
    ...Object.keys(definition.defaults as Record<string, unknown>),
    ...Object.keys(shape ?? {}),
  ])

  for (const key of Object.keys(patch)) {
    if (!known.has(key)) {
      // Refused rather than dropped: a caller setting a key this policy does not have has
      // misunderstood something, and silently discarding it would leave them believing a
      // setting is in force.
      throw new SettingsError(`${moduleId} policy has no setting "${key}"`)
    }
  }

  const next: Record<string, unknown> = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    // Explicit null clears an override back to the default.
    if (value === null) delete next[key]
    else next[key] = value
  }

  return { next, resolved: resolvePolicyValue<T>(moduleId, next) }
}
