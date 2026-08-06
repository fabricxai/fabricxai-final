/**
 * MARBIM tools for 3.1 Store.
 *
 * The store is where the bonded rule bites. A storekeeper at the issue window is deciding
 * whether fabric may leave the shelf, and the answer depends on a UD balance in another
 * module and a requisition in this one — which is exactly the question somebody asks under
 * pressure, and exactly the one MARBIM could not read a single number for.
 *
 * **Nothing here issues anything.** An issue draws down a UD inside a locked transaction so
 * two storekeepers taking the last of a roll serialise; a tool that issued would either
 * duplicate that lock badly or bypass it. The reads answer "what is here, what is owed, and
 * would this be allowed" — the doing stays on the floor screen and its offline queue.
 *
 * **One draft, and it is the adjustment.** A stock adjustment is the one store write that is
 * an assertion rather than an event: nothing physically happened, somebody is saying the
 * shelf and the ledger disagree. That is precisely what should need a second person, which
 * is why it is the module's only pending target.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { itemList, outstandingRequisitions, recentGrns, rollsForItem, stockOnHand } from './queries'

const noArgs = z.object({}).passthrough()

const itemInput = z.object({
  itemId: z.string().uuid(),
})

const listInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
})

const stock: ReadTool = {
  kind: 'read',
  name: 'store.stock_on_hand',
  description:
    'Every item with what is physically on hand, what is reserved against requisitions and ' +
    'what is therefore free. Answer availability from the FREE figure, never from on-hand — ' +
    'stock already reserved for a cutting order is not stock anybody else can have.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => stockOnHand(ctx),
}

const items: ReadTool = {
  kind: 'read',
  name: 'store.items',
  description:
    'The item master: codes, descriptions, units and whether each is bonded. Bonded matters ' +
    'more than anything else on the row — bonded material cannot be issued without a UD, and ' +
    'issuing it anyway is a customs offence rather than a paperwork slip.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => itemList(ctx),
}

const rolls: ReadTool = {
  kind: 'read',
  name: 'store.rolls_for_item',
  description:
    'Individual rolls of one item with their lot, length and status. Cutting draws named ' +
    'rolls, so this is what answers "which rolls can this lay use".',
  input: itemInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { itemId } = itemInput.parse(args)
    return rollsForItem(ctx, itemId)
  },
}

const grns: ReadTool = {
  kind: 'read',
  name: 'store.recent_receipts',
  description:
    'Goods received recently, with the supplier, the UD each bonded receipt was booked ' +
    'against, and the quantities. Use this to answer "has it arrived" before anybody walks ' +
    'to the delivery bay.',
  input: listInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { limit } = listInput.parse(args)
    return recentGrns(ctx, limit)
  },
}

const owed: ReadTool = {
  kind: 'read',
  name: 'store.outstanding_requisitions',
  description:
    'Requisition lines still waiting to be issued, and how much of each is short. This is ' +
    'what the floor is waiting on — say the shortfall in the requisition’s own unit and ' +
    'never convert it.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => outstandingRequisitions(ctx),
}

/**
 * The adjustment draft.
 *
 * `qtyDelta` scores lowest of the three deliberately. A reason code is chosen from a list
 * and an item is identified by code, but the QUANTITY is somebody's count of what is
 * actually on a shelf — and an adjustment is the one store write with no physical event
 * behind it to check against. If a reviewer only re-reads one field, it should be that one.
 */
const proposeAdjustmentInput = z.object({
  itemId: z.string().uuid(),
  rollId: z.string().uuid().optional(),
  qtyDelta: z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/, 'a signed decimal quantity'),
  unit: z.string().min(1),
  reasonCode: z.string().min(1),
  note: z.string().min(10, 'an adjustment needs a stated reason'),
})

const proposeAdjustment: DraftTool = {
  kind: 'draft',
  name: 'store.propose_stock_adjustment',
  targetTable: 'stock_adjustments',
  description:
    'Propose writing stock up or down when the shelf and the ledger disagree — a signed ' +
    'quantity, a reason code and a written note. This does not move stock: nothing ' +
    'physically happened, somebody is asserting the record is wrong, so it goes to a second ' +
    'person. Never propose one to make a shortfall go away; if an issue is short, the answer ' +
    'is the shortfall, not a smaller ledger.',
  input: proposeAdjustmentInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const adjustment = proposeAdjustmentInput.parse(args)

    return {
      targetTable: 'stock_adjustments',
      operation: 'insert' as const,
      zodSchemaKey: 'stock_adjustment_v1',
      payload: adjustment,
      // Read `qtyDelta` and the note. An adjustment is the one store write with no
      // physical event behind it: the quantity is somebody's count of a shelf with nothing
      // to check it against, and the note is the entire justification later.
      method:
        'stated by the storekeeper · the quantity is a physical count with no second source',
    }
  },
}

export const storeToolPack: ToolPack = {
  moduleId: 'store',
  tools: [stock, items, rolls, grns, owed, proposeAdjustment],
}
