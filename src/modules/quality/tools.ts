/**
 * MARBIM tools for 7.1 Quality.
 *
 * Quality had a primer and no tools, so an assistant that knew DHU is defects per hundred
 * units, and that an AQL plan is drawn from a table rather than guessed, could read neither
 * a defect nor a plan.
 *
 * **The policy comes from Settings, per tenant, on every call.** The AQL standard, the
 * 4-point acceptance limit and the DHU alert threshold are things a factory negotiates and
 * changes; a constant baked in here would answer with somebody else's allowance and be
 * right often enough that nobody checked. It is imported lazily for the reason cutting's
 * register already documents — a static edge from a module into Settings is an import cycle.
 *
 * **No draft tool for an inspection result.** A final inspection is a verdict somebody
 * reached by counting a sample; proposing one would put a model's opinion where a person's
 * count belongs, and the approve inbox would make it look reviewed. The one draftable thing
 * here is the measurement CHART, which is transcription off a buyer's spec sheet.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { dhuByLine, recentFinalInspections } from './queries'
import { aqlPlanFor, preFinalReadiness, repeatDefectAlerts, type QualityPolicy } from './service'

/** The tenant's own quality policy. Never a constant — see the note above. */
async function policyFor(ctx: AnyCtx): Promise<QualityPolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<QualityPolicy>(ctx, 'quality')
}

const dhuInput = z.object({
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
})

const windowInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lineId: z.string().uuid().optional(),
})

const aqlInput = z.object({
  lotQty: z.number().int().positive(),
  inspectionLevel: z.string().min(1),
  majorAql: z.string().min(1),
  minorAql: z.string().min(1),
})

const readinessInput = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowDays: z.number().int().min(1).max(90).default(14),
})

const listInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
})

const dhu: ReadTool = {
  kind: 'read',
  name: 'quality.dhu_by_line',
  description:
    'DHU per line for one day — defects per hundred units, with the defect count and the ' +
    'units checked behind it. Quote the denominator: 8 DHU from 25 pieces checked is not ' +
    'the same fact as 8 DHU from 2,000, and a line with nothing checked has no DHU rather ' +
    'than a good one.',
  input: dhuInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { on } = dhuInput.parse(args)
    const policy = await policyFor(ctx)
    return dhuByLine(ctx, { on, threshold: policy.dhuAlertThreshold ?? null })
  },
}

const repeats: ReadTool = {
  kind: 'read',
  name: 'quality.repeat_defects',
  description:
    'The same defect recurring on the same operation across consecutive days — a training ' +
    'or machine problem rather than bad luck. This is the pattern worth raising; a single ' +
    'day’s spike usually is not.',
  input: windowInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const window = windowInput.parse(args)
    return repeatDefectAlerts(ctx, window, await policyFor(ctx))
  },
}

const aqlPlan: ReadTool = {
  kind: 'read',
  name: 'quality.aql_plan',
  description:
    'The sampling plan for a lot size and inspection level: sample size, and the accept and ' +
    'reject numbers. Read from the factory’s own standard table — never work a sample size ' +
    'out yourself, and if no row covers the lot say so rather than interpolating.',
  input: aqlInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = aqlInput.parse(args)
    return aqlPlanFor(ctx, input, await policyFor(ctx))
  },
}

const finals: ReadTool = {
  kind: 'read',
  name: 'quality.final_inspections',
  description:
    'Recent final inspections with their lot size, sample, defects found and verdict. A ' +
    'failed one blocks the shipment gate, so say which shipment it belongs to.',
  input: listInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { limit } = listInput.parse(args)
    return recentFinalInspections(ctx, limit)
  },
}

const readiness: ReadTool = {
  kind: 'read',
  name: 'quality.pre_final_readiness',
  description:
    'Orders approaching their final inspection and whether anything is outstanding — what ' +
    'QC should be preparing for, before the shipment date makes it urgent.',
  input: readinessInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = readinessInput.parse(args)
    return preFinalReadiness(ctx, input, await policyFor(ctx))
  },
}

/**
 * The measurement chart draft — the one thing here a model should be transcribing.
 *
 * A buyer's spec sheet is a table of points, specs and tolerances, and typing it is exactly
 * the error-prone clerical act extraction is for. Tolerances score lower than the point
 * names on purpose: a name copied wrong reads as obviously wrong, a `+0.5` read as `+0.6`
 * passes a garment that should have failed and nobody ever finds out.
 */
const proposeSpecInput = z.object({
  styleCode: z.string().min(1),
  unit: z.string().min(1).max(10).default('cm'),
  points: z
    .array(
      z.object({
        name: z.string().min(1),
        spec: z.string().min(1),
        tolPlus: z.string().min(1),
        tolMinus: z.string().min(1),
      }),
    )
    .min(1),
})

const proposeSpec: DraftTool = {
  kind: 'draft',
  name: 'quality.propose_measurement_spec',
  targetTable: 'measurement_specs',
  description:
    'Propose a measurement chart read off a buyer’s spec sheet — the points of measure with ' +
    'their spec and asymmetric tolerances. It goes to the approve inbox, not into the ' +
    'system: this chart is what every garment is measured against, so a mistyped tolerance ' +
    'passes work that should have been rejected.',
  input: proposeSpecInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const spec = proposeSpecInput.parse(args)

    return {
      targetTable: 'measurement_specs',
      operation: 'insert' as const,
      zodSchemaKey: 'measurement_spec',
      payload: spec,
      fieldConfidence: {
        styleCode: 0.95,
        unit: 0.9,
        // The whole table as one field, at the weakest thing in it. Tolerances are small
        // numbers in small type and are what a reviewer must actually re-read.
        points: 0.71,
      },
      method: 'transcribed from a buyer spec sheet · tolerances scored lowest',
    }
  },
}

export const qualityToolPack: ToolPack = {
  moduleId: 'quality',
  tools: [dhu, repeats, aqlPlan, finals, readiness, proposeSpec],
}
