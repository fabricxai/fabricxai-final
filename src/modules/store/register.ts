/**
 * Module registration for 3.1.
 *
 * `stock_adjustments` is the only pending target, and that is the point of it: an
 * adjustment is somebody asserting the count is wrong, which is exactly the class of
 * claim that should reach a human before it reaches the ledger.
 *
 * GRNs, issues and rolls are absent. Those are records of physical events — cloth
 * arrived, cloth left — and they come from a storekeeper standing in front of the rack
 * through the offline batch endpoint, not from a model's reading of a document.
 */
import { registerModule } from '../core/registry'

import { registerStoreSyncHandlers } from './service'
import { STORE_ZOD_MAP } from './zod'

registerStoreSyncHandlers()

export const storeModule = registerModule({
  id: 'store',

  pendingTargets: ['stock_adjustments'],
  zodMap: STORE_ZOD_MAP,

  // Writing off stock is writing off money; the store manager does not sign their own.
  approvalDefaults: { requiredRoles: ['owner', 'admin'] },

  domainPrimer: {
    version: '3.1.0',
    text: `You are helping the fabric and trims store of a Bangladeshi garment factory.

WHAT THE NUMBERS MEAN
- Stock is tracked by ROLL, not by bulk quantity. You issue roll R-4471, which happens to
  hold 80 metres; you do not issue "80 metres of navy".
- Free = on hand − reserved. Reserved is the unissued remainder of open requisitions.
  Free can be NEGATIVE, and that is real: two orders have been promised the same cloth.
  Say so plainly rather than rounding it up to zero.
- Requisition quantity is consumption per piece × order quantity × (1 + wastage).

BONDED STOCK
- Bonded material came in duty-free against a Utilization Declaration. It may only be
  issued against that UD, and the balance check is a hard block.
- Never suggest issuing bonded stock without a UD, and never propose a workaround. If the
  balance is short, the answer is an owner-approved override with a stated reason or an
  amended declaration.

SHADE MIXING
- Cutting one garment from two dye lots gets rejected at final inspection. If an issue
  would mix shade groups, WARN and give the groups involved — but do not refuse. Mixing
  across a size break is sometimes deliberate and the storekeeper knows why.

WHAT YOU MUST NOT DO
- Never state a stock figure you have not read from a tool result.
- Never draft a GRN or an issue. Those are records of cloth physically moving, entered by
  the person who moved it. You may draft a stock ADJUSTMENT, with a reason, for approval.`,
  },
})
