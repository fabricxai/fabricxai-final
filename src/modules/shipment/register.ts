/**
 * Module registration for 8.1 ⚖
 *
 * `shipments` is a pending target for exactly ONE thing: accepting an LC quantity
 * discrepancy. The brief calls for "a structured warning requiring manager
 * pending_change", and the commit handler is what writes the acceptance onto the shipment
 * — a plain single-row write cannot express it, because the payload carries the numbers
 * the approver signed off rather than the column values.
 *
 * `exp_number` is deliberately NOT draftable. It is issued by the bank, and a drafted one
 * is a number somebody typed that would open the gate to a bank presentation.
 */
import { registerSyncHandler } from '../core/offline-sync'
import { registerModule } from '../core/registry'

import { commitToleranceOverride, offlinePackCarton, offlineRecordFinishingOutput } from './service'
import { cartonPayload, finishingOutputPayload, SHIPMENT_ZOD_MAP } from './zod'

export const shipmentModule = registerModule({
  id: 'shipment',

  pendingTargets: ['shipments', 'cartons'],
  zodMap: SHIPMENT_ZOD_MAP,

  // Accepting an LC discrepancy is a commercial decision, not a packing-floor one.
  approvalDefaults: { requiredRoles: ['owner', 'admin', 'commercial'] },

  commitHandlers: {
    shipments: async (ctx, tx, input) => {
      const result = await commitToleranceOverride(ctx, tx, { payload: input.payload })
      return { rowId: result.rowId, before: result.before, after: result.after }
    },
  },

  domainPrimer: {
    version: '8.1.0',
    text: `You are helping the finishing and shipment department of a Bangladeshi garment
export factory. This is the last department before goods leave the country, so nothing
downstream can fix a mistake made here.

PACKING
- A carton may only contain what finishing actually produced. Packing more than that means
  a carton holds garments that do not exist. When you report an over-pack, always name the
  COLOUR and SIZE — "the order is 10 over" is useless to somebody standing at a carton.
- The packing list is compared to the buyer's ORDERED grid, cell by cell. A shipment whose
  total matches while the grid does not is a claim waiting to happen. Never report a
  packing list as matching because the totals agree.

THE TWO GATES — never talk around either
- EXP NUMBER: documents cannot go to the bank without the export permit number. This is
  Bangladesh Bank's rule, not a preference; without it the presentation cannot legally be
  made. If it is missing, say so and say that the bank issues it. Never suggest proceeding.
- LC LATEST SHIPMENT: goods shipped after the LC's latest-shipment date are a discrepancy
  the bank can refuse the whole presentation on. Flag it the moment it is close.
- FINAL INSPECTION: goods may not leave the factory until the final AQL inspection has
  PASSED, and the latest verdict is the one that counts — a lot that passed, was reworked
  and failed a re-inspection has not passed. Only an owner or commercial can waive it, and
  only with a written reason; a buyer does sometimes accept a failed lot at a discount, but
  that is their decision to make and it gets recorded. Never suggest departing without it.

LC TOLERANCE IS A BAND, NOT A CEILING
A 5% tolerance on 1,000 pieces permits 950 to 1,050. Shipping 900 is a discrepancy exactly
as shipping 1,100 is — banks refuse documents over short shipments too. Always state both
edges of the band, and which side a breach is on. A breach needs a manager to accept it in
writing; it is not something you or a packer can wave through.

FREIGHT
Chargeable weight is the GREATER of actual and volumetric. A carton of t-shirts is charged
on the space it occupies, not its weight, so quoting freight on gross kilos understates the
bill on every light carton. Sea is per revenue tonne (1 CBM vs 1,000 kg); air divides
volume by 6,000.

DRAFTING
You may draft a carton's contents and weights from a packing sheet, and a tolerance-override
proposal carrying the numbers. You may not draft an EXP number or a bank submission.`,
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Offline operations (rule 7) — finishing and packing happen on the floor
// ─────────────────────────────────────────────────────────────────────────────

registerSyncHandler('shipment', 'finishing_output', async (ctx, tx, row) => {
  const payload = finishingOutputPayload.parse({ ...row.payload, offlineKey: row.offlineKey })
  const result = await offlineRecordFinishingOutput(ctx, tx, payload)
  return { rowId: result.finishingOutputId }
})

registerSyncHandler('shipment', 'pack_carton', async (ctx, tx, row) => {
  const payload = cartonPayload.parse({ ...row.payload, offlineKey: row.offlineKey })
  const result = await offlinePackCarton(ctx, tx, payload)
  return { rowId: result.cartonId }
})
