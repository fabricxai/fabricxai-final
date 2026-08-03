/**
 * MARBIM tools for 1.5 Costing Studio.
 *
 * The question this pack exists for is asked with a buyer on the phone: "can we do it at
 * $5.20?" The honest answer needs a bill of materials, today's rates and the factory's own
 * margin floor — and every one of those was unreachable, so an assistant that knew what a
 * margin floor was could not tell anybody whether a price cleared one.
 *
 * **`costing.preview` computes through the SERVICE, never in prose.** It runs the same
 * arithmetic the studio previews and the approve path enforces, so a margin quoted here is
 * the margin the gate will apply. A model doing the sum itself would eventually produce a
 * price that looked fine and failed at approval, with a buyer already told.
 *
 * **The floor is reported, never applied.** These tools say a sheet is below it; they do not
 * decide anything. Approving under the floor is an owner's decision with a stated reason
 * (`costing.errors.below_floor_needs_owner`), and a tool that quietly rounded a price up to
 * clear it would be answering a commercial question by moving the number.
 *
 * **No draft tool.** A cost sheet is a version somebody signs and quotes against, and a BOM
 * arrives either from a tech pack through document intake or typed in the builder. A third,
 * conversational route to the same tables would be a way to propose a price from a chat.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { bomDetail, bomLibrary, getBomForStyle } from './queries'
import { getApprovedSheet, previewCostSheet, type CostingPolicy } from './service'

/** The factory's own margin floor. Negotiated per company — never a constant here. */
async function policyFor(ctx: AnyCtx): Promise<CostingPolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<CostingPolicy>(ctx, 'costing')
}

const noArgs = z.object({}).passthrough()

const styleInput = z.object({
  styleCode: z.string().min(1),
})

const bomInput = z.object({
  bomId: z.string().uuid(),
})

const previewInput = z.object({
  /** The full sheet as the studio holds it — fabric, trims, CM, overheads, the FOB price. */
  sections: z.unknown(),
  overrides: z.unknown().optional(),
})

const boms: ReadTool = {
  kind: 'read',
  name: 'costing.bom_library',
  description:
    'Every bill of materials with its style, where it came from, and whether its consumption ' +
    'was MEASURED on a real order or estimated. That distinction decides how much a quote ' +
    'built on it can be trusted — say which it is rather than quoting the figures flat.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => bomLibrary(ctx),
}

const bom: ReadTool = {
  kind: 'read',
  name: 'costing.bom_detail',
  description:
    'One bill of materials, line by line: item, per-garment consumption, unit and wastage, ' +
    'with each line marked measured or estimated. Consumption here is PER GARMENT — never ' +
    'read it as an order quantity.',
  input: bomInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { bomId } = bomInput.parse(args)
    return bomDetail(ctx, bomId)
  },
}

const bomForStyle: ReadTool = {
  kind: 'read',
  name: 'costing.bom_for_style',
  description:
    'The bill of materials behind a style’s live approved cost sheet — what a requisition ' +
    'for that style is sized from. Refuses when the approved sheet has no BOM, which is a ' +
    'real gap rather than an empty list.',
  input: styleInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { styleCode } = styleInput.parse(args)
    return getBomForStyle(ctx, styleCode)
  },
}

const approved: ReadTool = {
  kind: 'read',
  name: 'costing.approved_sheet',
  description:
    'The approved cost sheet a style is currently quoted on: its version, total cost, FOB ' +
    'price and achieved margin. This is the number in force — a draft sheet somebody is ' +
    'still editing is not what the buyer was told.',
  input: styleInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { styleCode } = styleInput.parse(args)
    return getApprovedSheet(ctx, styleCode)
  },
}

const preview: ReadTool = {
  kind: 'read',
  name: 'costing.preview',
  description:
    'Cost a sheet without saving it: totals, cost per garment, achieved margin, and whether ' +
    'it clears the factory’s margin floor. Nothing is written and nothing is approved — ' +
    'below the floor only an owner may sign, with a reason, so report the shortfall and stop ' +
    'rather than adjusting a price to clear it.',
  input: previewInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { sections, overrides } = previewInput.parse(args)
    const policy = await policyFor(ctx)

    const result = await previewCostSheet(
      ctx,
      { sections, ...(overrides === undefined ? {} : { overrides }) },
      policy,
    )

    // The floor is carried alongside the answer rather than left implicit: "12.02%" means
    // nothing without the number it has to beat, and a model asked to remember the floor
    // separately will eventually quote last month's.
    return { ...result, marginFloorPct: policy.marginFloorPct ?? null }
  },
}

export const costingToolPack: ToolPack = {
  moduleId: 'costing',
  tools: [boms, bom, bomForStyle, approved, preview],
}
