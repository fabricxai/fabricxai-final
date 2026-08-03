/**
 * MARBIM tools for 5.1 Cutting.
 *
 * The primer already teaches this department's craft — that completion is a GRID and not a
 * total, that over-cut and short-cut are different failures, that the PP gate is not
 * negotiable. It had nothing to read those facts from: cutting registered a primer and no
 * tools, so every question on the cutting floor was answered "I have nothing to read a
 * figure from".
 *
 * **Everything here returns the shape the service returns, not a flattened number.** The
 * position tool hands back `shortCells` rather than a percentage on its own, because the
 * one thing the primer insists on is that 1,000 of 1,000 cut is not a finished order when
 * black is 200 short — and a model given only "100%" cannot say so.
 *
 * **One draft tool, and it proposes a marker.** A marker is reference data somebody reads
 * off a marker plan; getting it wrong wastes fabric and is caught by a person before it is
 * used. A cut REPORT is not draftable here on purpose: it is a floor write by somebody
 * standing at the table, and it goes through the offline queue (rule 7) so the table never
 * waits for an approval — the module registers `cut_reports` as a pending target for
 * CORRECTIONS, which is a different act with a human already deciding it.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { cuttableOrders, layForReport, recentLays } from './queries'
import { cutPosition, ppApprovalStatus } from './service'

const noArgs = z.object({}).passthrough()

const recentLaysInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
})

const positionInput = z.object({
  orderStyleId: z.string().uuid(),
})

const layInput = z.object({
  layId: z.string().uuid(),
})

const ppApprovalInput = z.object({
  orderId: z.string().uuid(),
  orderStyleId: z.string().uuid(),
})

const lays: ReadTool = {
  kind: 'read',
  name: 'cutting.recent_lays',
  description:
    'Lays spread recently, with their marker, plies, planned fabric and status. Use this ' +
    'to answer "what has the floor been cutting" and to find a lay id for another tool.',
  input: recentLaysInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { limit } = recentLaysInput.parse(args)
    return recentLays(ctx, limit)
  },
}

const position: ReadTool = {
  kind: 'read',
  name: 'cutting.position',
  description:
    'How much of a style has been cut against the buyer’s breakdown, as a percentage AND ' +
    'the cells that are short. Never report a style as cut from the percentage alone — a ' +
    'grid can total 100% while a colour and size is short, and a short cell is a short ' +
    'shipment. Quote the short cells if there are any.',
  input: positionInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { orderStyleId } = positionInput.parse(args)
    return cutPosition(ctx, { orderStyleId })
  },
}

const openOrders: ReadTool = {
  kind: 'read',
  name: 'cutting.open_orders',
  description:
    'Confirmed and in-production orders with their styles, soonest ex-factory first. This ' +
    'is what the floor COULD be working on — it does not check any gate, so never say a ' +
    'style may be cut on the strength of appearing here. Ask cutting.pp_approval for that.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => cuttableOrders(ctx),
}

const ppApproval: ReadTool = {
  kind: 'read',
  name: 'cutting.pp_approval',
  description:
    'Whether the PP-approval gate would let this style be spread, and the reason if not. ' +
    'This is the same gate the write enforces, so the answer is what will actually happen. ' +
    'If it blocks, say which gate and what would clear it — never a way around it.',
  input: ppApprovalInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = ppApprovalInput.parse(args)
    return ppApprovalStatus(ctx, input)
  },
}

const layDetail: ReadTool = {
  kind: 'read',
  name: 'cutting.lay_detail',
  description:
    'One lay with the cells its marker yields and what has been reported against it — what ' +
    'a cut report is checked against.',
  input: layInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { layId } = layInput.parse(args)
    return layForReport(ctx, layId)
  },
}

/**
 * The marker draft.
 *
 * Confidence is per field and comes from how each value was obtained, never a constant
 * (CLAUDE.md rule 3): a code and a ratio copied from a marker plan are transcription, and
 * the lay length is a measurement somebody may have rounded. The reviewer sees which is
 * which and looks at the softer one.
 */
const proposeMarkerInput = z.object({
  code: z.string().min(1).max(60),
  styleCode: z.string().min(1),
  sizeRatio: z.record(z.string().min(1), z.number().int().positive()),
  layLengthMeters: z.string().min(1),
  efficiencyPct: z.string().optional(),
  fabricWidthInches: z.string().optional(),
})

const proposeMarker: DraftTool = {
  kind: 'draft',
  name: 'cutting.propose_marker',
  targetTable: 'markers',
  description:
    'Propose a marker read off a marker plan — its code, style, size ratio per ply and lay ' +
    'length. This does not create it: it lands in the approve inbox for the cutting ' +
    'in-charge to check against the plan, because a wrong ratio cuts the wrong garment ' +
    'count for every ply in the spread.',
  input: proposeMarkerInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const marker = proposeMarkerInput.parse(args)

    const payload: Record<string, unknown> = {
      code: marker.code,
      styleCode: marker.styleCode,
      sizeRatio: marker.sizeRatio,
      layLengthMeters: marker.layLengthMeters,
      ...(marker.efficiencyPct ? { efficiencyPct: marker.efficiencyPct } : {}),
      ...(marker.fabricWidthInches ? { fabricWidthInches: marker.fabricWidthInches } : {}),
    }

    return {
      targetTable: 'markers',
      operation: 'insert' as const,
      zodSchemaKey: 'marker',
      payload,
      // Transcribed identifiers score higher than measured lengths: a code copied wrong is
      // usually obvious, a lay length rounded by a tenth of a metre is not.
      fieldConfidence: {
        code: 0.95,
        styleCode: 0.95,
        sizeRatio: 0.88,
        layLengthMeters: 0.74,
        ...(marker.efficiencyPct ? { efficiencyPct: 0.7 } : {}),
        ...(marker.fabricWidthInches ? { fabricWidthInches: 0.8 } : {}),
      },
      method: 'read from a marker plan · identifiers transcribed, lengths measured',
    }
  },
}

export const cuttingToolPack: ToolPack = {
  moduleId: 'cutting',
  tools: [lays, position, openOrders, ppApproval, layDetail, proposeMarker],
}
