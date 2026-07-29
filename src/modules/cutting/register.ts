/**
 * Module registration for 5.1 ⚖
 *
 * Floor-facing, so `createLay` and `recordCutReport` are registered as offline sync
 * operations (rule 7). A cutting floor tablet loses the network constantly and replays
 * whole batches when it reconnects; the `offline_keys` ledger turns a replay into a no-op
 * that returns the original result.
 *
 * `cut_reports` is a pending target only for CORRECTIONS. A first report is a floor write
 * by somebody standing at the table — routing it through an approval queue would mean the
 * cutting floor waits for an office. Restating it afterwards is a different act, and that
 * one needs a human.
 */
import { registerSyncHandler } from '../core/offline-sync'
import { registerModule } from '../core/registry'

import {
  commitCutReportCorrection,
  offlineCreateLay,
  offlineRecordCutReport,
  type CuttingPolicy,
} from './service'
import { createLayPayload, cutReportPayload, CUTTING_ZOD_MAP } from './zod'

/**
 * The tolerance an offline-synced report is validated against.
 *
 * A device replaying a week-old batch must be judged by the same allowance as the report
 * filed live, so this comes from one place rather than the request. X.3 Settings will own
 * it; until then it is here and visible rather than defaulted inside the checker.
 */
export const OFFLINE_CUTTING_POLICY: CuttingPolicy = { tolerancePct: '2' }

export const cuttingModule = registerModule({
  id: 'cutting',

  pendingTargets: ['markers', 'cut_reports'],
  zodMap: CUTTING_ZOD_MAP,

  // Cutting in-charge drafts, production manager approves.
  approvalDefaults: { requiredRoles: ['owner', 'admin', 'production'] },

  commitHandlers: {
    cut_reports: async (ctx, tx, input) => {
      const result = await commitCutReportCorrection(ctx, tx, { payload: input.payload })
      return { rowId: result.rowId, before: result.before, after: result.after }
    },
  },

  domainPrimer: {
    version: '5.1.0',
    text: `You are helping a cutting in-charge on the floor of a Bangladeshi export factory.

WHAT CUTTING IS
- A marker is the arrangement of pattern pieces. Its size ratio is pieces per PLY: a 1:2:1
  marker at 100 plies yields 100 S, 200 M, 100 L.
- Fabric planned for a lay is lay length × plies. Wastage is what was actually drawn from
  the store against that plan.
- A cut report is checked against the buyer's active breakdown revision, cell by cell.

THE THING PEOPLE GET WRONG
Completion is a GRID, not a total. 1,000 pieces cut against 1,000 ordered is not a finished
order if black is 200 short and white is 200 over — the buyer ordered a size and colour
grid, and a short cell means a short shipment. Never report an order as cut because the
totals match.

Over-cut and short-cut are also different failures. Cutting extra burns fabric; cutting
short burns the order. Never net them into one number.

GATES YOU MUST NOT TALK AROUND
- No lay may be spread before the PP sample is approved. Cutting early is how a factory
  produces a whole order to a spec the buyer then rejects.
- A lay may only draw rolls the store actually issued to that order. On bonded fabric an
  unissued roll is a customs exposure, not a paperwork slip.
If either gate blocks, say which one and what would clear it. Never suggest a way round.

BUNDLES
Bundle numbers are stapled to physical stacks moving down the floor. They are generated
once per cut report and never re-generated — a second set of numbers for the same stacks
is how bundles get double-counted in sewing.

DRAFTING
You may draft a marker from a tech pack, and a correction to a cut report that is already
filed. A correction is reviewed by a human because the first number was written by
somebody who was standing at the table.`,
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Offline operations (rule 7)
// ─────────────────────────────────────────────────────────────────────────────

registerSyncHandler('cutting', 'create_lay', async (ctx, tx, row) => {
  const payload = createLayPayload.parse({ ...row.payload, offlineKey: row.offlineKey })
  const result = await offlineCreateLay(ctx, tx, payload)
  return { rowId: result.layId }
})

registerSyncHandler('cutting', 'record_cut_report', async (ctx, tx, row) => {
  const payload = cutReportPayload.parse({ ...row.payload, offlineKey: row.offlineKey })
  const result = await offlineRecordCutReport(ctx, tx, payload, OFFLINE_CUTTING_POLICY)
  return { rowId: result.cutReportId }
})
