/**
 * MARBIM tools for 8.1 Shipment.
 *
 * The end of the line, where three gates decide whether a factory gets paid: the EXP number
 * without which documents cannot lawfully be presented, the final inspection that must not
 * have failed, and the LC's tolerance band the shipped quantity has to sit inside. A
 * shipping clerk asking "can this go" is asking about all three at once, and MARBIM could
 * read none of them.
 *
 * **Nothing here hands anything to a bank.** `handoffDocsToBank` is a gated write with an
 * event trail on refusal; a tool that called it would be an assistant presenting documents.
 * These read the state those gates check, so the answer somebody gets is the answer the
 * gate will give — which is the only kind worth having.
 *
 * **The tolerance override is the one draft, and it is deliberately narrow.** Shipping
 * outside an LC's band is a commercial decision with a bank consequence, so the proposal
 * carries the numbers AND a written reason, and an owner or commercial lead signs it. The
 * carton table is a pending target too and gets no draft tool: a carton is packed by
 * somebody holding it, through the offline queue, and a proposed carton is a box nobody saw.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { shipmentBoard } from './queries'
import {
  freightSummary,
  latestShipmentAlerts,
  remainingToPackFor,
  unloadedCartons,
} from './service'

const noArgs = z.object({}).passthrough()

const orderInput = z.object({
  orderId: z.string().uuid(),
})

const freightInput = z.object({
  orderId: z.string().uuid(),
  mode: z.enum(['sea', 'air']),
})

const alertsInput = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
  withinDays: z.number().int().min(1).max(120).default(21),
})

const board: ReadTool = {
  kind: 'read',
  name: 'shipment.board',
  description:
    'Every shipment with its EXP number, packing list state, document checklist and what is ' +
    'blocking it. If somebody asks whether a shipment can go, start here and name the ' +
    'blocker — never say a shipment is ready because no blocker is listed for one gate.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => shipmentBoard(ctx),
}

const remaining: ReadTool = {
  kind: 'read',
  name: 'shipment.remaining_to_pack',
  description:
    'What is still to be packed on an order, per colour and size, against what finishing has ' +
    'produced. A cell at zero is packed; a NEGATIVE cell means more has been packed than ' +
    'finished, which is an over-pack somebody needs to explain.',
  input: orderInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { orderId } = orderInput.parse(args)
    return remainingToPackFor(ctx, { orderId })
  },
}

const loose: ReadTool = {
  kind: 'read',
  name: 'shipment.unloaded_cartons',
  description:
    'Cartons packed against an order and not yet loaded onto any shipment — boxes on the ' +
    'floor that no manifest accounts for.',
  input: orderInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { orderId } = orderInput.parse(args)
    return unloadedCartons(ctx, { orderId })
  },
}

const freight: ReadTool = {
  kind: 'read',
  name: 'shipment.freight_summary',
  description:
    'Carton count, total CBM and gross weight for an order, with the chargeable weight — ' +
    'the GREATER of actual and volumetric, which is what a forwarder invoices on. Quote both ' +
    'so nobody budgets against the smaller one.',
  input: freightInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = freightInput.parse(args)
    return freightSummary(ctx, input)
  },
}

const lcCountdown: ReadTool = {
  kind: 'read',
  name: 'shipment.latest_shipment_alerts',
  description:
    'Shipments approaching or past their LC’s latest-shipment date, with days remaining. ' +
    'Goods that leave after that date produce discrepant documents even though the credit ' +
    'has not expired — the bank can refuse to pay, so this is a red alert and not a diary ' +
    'note.',
  input: alertsInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = alertsInput.parse(args)
    return latestShipmentAlerts(ctx, input)
  },
}

/**
 * The tolerance override draft.
 *
 * The quantities score high and the REASON scores lowest — inverted from most drafts here,
 * and on purpose. `lcQty`, `shippedQty` and the variance are arithmetic somebody can check
 * in a second; the reason is the only part a bank, an auditor or a buyer will actually read
 * later, and the only part a model could produce something plausible-but-empty for.
 */
const proposeOverrideInput = z.object({
  shipmentId: z.string().uuid(),
  lcQty: z.number().int().min(1),
  shippedQty: z.number().int().min(0),
  tolerancePct: z.string().min(1),
  direction: z.enum(['over', 'short']),
  varianceQty: z.number().int().min(1),
  reason: z.string().min(1).max(500),
})

const proposeOverride: DraftTool = {
  kind: 'draft',
  name: 'shipment.propose_tolerance_override',
  targetTable: 'shipments',
  description:
    'Propose shipping outside the LC’s agreed quantity band, with the numbers and a written ' +
    'reason. This does not clear anything: an owner or commercial lead decides, because the ' +
    'consequence lands at a bank counter. Only propose one when the shipped quantity is ' +
    'genuinely outside the band — inside it there is nothing to override.',
  input: proposeOverrideInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const override = proposeOverrideInput.parse(args)

    return {
      targetTable: 'shipments',
      targetId: override.shipmentId,
      operation: 'update' as const,
      zodSchemaKey: 'tolerance_override',
      payload: override,
      // Read the reason. The quantities come off the LC and the manifest and can be
      // checked against them; the reason is the requester's account of why, and it is the
      // part somebody is later judged on.
      method:
        'quantities read from the LC and the manifest · the reason is the requester’s own account',
    }
  },
}

export const shipmentToolPack: ToolPack = {
  moduleId: 'shipment',
  tools: [board, remaining, loose, freight, lcCountdown, proposeOverride],
}
