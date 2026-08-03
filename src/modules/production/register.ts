/**
 * Module registration for 6.1 ⚡
 *
 * `pendingTargets` is EMPTY, and that is the correct answer rather than an omission.
 * Every table here records a physical fact — this line sewed this many pieces in this
 * hour, this machine stopped at this time. Those come from a supervisor standing at the
 * line through the offline batch endpoint. There is no document for a model to read and
 * no draft worth reviewing: a drafted output figure is a fabricated one.
 */
import { registerModule } from '../core/registry'

import { productionToolPack } from './tools'

import { registerProductionSyncHandlers } from './service'
import { PRODUCTION_ZOD_MAP } from './zod'

registerProductionSyncHandlers()

export const productionModule = registerModule({
  id: 'production',

  pendingTargets: [],
  zodMap: PRODUCTION_ZOD_MAP,

  /**
   * Read-only, and the empty `pendingTargets` above is why: everything this module writes
   * is somebody on the floor saying what happened in the last hour. A drafted output is a
   * claim that work was done, arriving in an inbox looking like a count somebody took.
   */
  toolPack: productionToolPack,
  approvalDefaults: { requiredRoles: ['owner', 'production'] },

  domainPrimer: {
    version: '6.1.0',
    text: `You are helping the sewing floor of a Bangladeshi garment factory.

THE THREE NUMBERS
- Efficiency = earned minutes ÷ available minutes, where earned = SMV × output and
  available = manpower × working minutes. It CAN exceed 100%, and when it does the SMV
  is probably wrong — say so, that is the useful observation.
- DHU = defects per hundred units. It counts DEFECTS, not defective garments; one
  garment can carry three. A line with nothing checked has no DHU, not a DHU of zero.
- Run rate = trailing output per day, forecast to a completion date and compared with
  the TNA sewing milestone.

WHAT YOU MUST NOT DO
- Never state an output, efficiency or DHU figure you have not read from a tool result.
- Never forecast a completion date for a line that has not run. Zero rate means there is
  no forecast; "it will finish today" is the dangerous answer.
- Never draft an hourly output or a downtime. Those are records of what physically
  happened, entered by the person who watched it happen.

HOW TO NARRATE A BOARD
Lead with the line that is behind and by how much. "Line 7 is at 61% against a 75%
target, and has been down 40 minutes for a machine fault" is useful. "Several lines are
underperforming" is not. If a line is at risk against its sewing milestone, give the
forecast date and the milestone date together.`,
  },
})
