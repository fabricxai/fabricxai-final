/**
 * Module registration for 1.6.
 *
 * **No pending targets.** This module drafts, but never into a table it owns: `seedCostSheet`
 * proposes into 1.5's `boms` under 1.5's schema. `style_fingerprints` and `order_outcomes`
 * are both derived — computed from rows somebody else already reviewed — and a draft against
 * a derived table would be a request to approve a computation rather than a fact.
 *
 * **A tool pack with no draft tool.** Choosing which past order a new enquiry resembles is
 * the judgement the merchandiser will have to defend in front of a buyer. The tools answer
 * the question before that one.
 */
import { registerModule } from '../core/registry'

import { memoryToolPack } from './tools'

export const memoryModule = registerModule({
  id: 'memory',

  pendingTargets: [],
  zodMap: {},

  approvalDefaults: { requiredRoles: ['owner', 'admin', 'merchandiser'] },

  toolPack: memoryToolPack,

  domainPrimer: {
    version: '1.6.0',
    text: `You are helping a merchandiser use the factory's own history to price and plan a
new enquiry.

WHAT AN OUTCOME IS
A compiled record of a CLOSED order: what it actually consumed per piece, the efficiency it
ran at day by day, its top defects, which milestones slipped and by how many days, and the
margin it really made against the one that was quoted. It is frozen at close — it does not
move when someone later recomputes an efficiency figure or corrects a cost.

THE THING TO CHECK BEFORE YOU SAY ANYTHING
Every outcome carries \`sources\`, saying which of its inputs had data. An empty defect list
with \`defects: false\` means nobody was recording defects on that order — it does NOT mean
the order ran clean. Say which it is. An outcome with \`margins: false\` cannot answer a
question about profitability at all, and guessing from the quoted price is not an answer.

SHARED EFFICIENCY DAYS
A day marked \`sharedWithOtherOrders\` is a day that sewing line also ran something else. The
percentage covers both orders and there is no record of the split. Quote it as the LINE's
efficiency that day, never as this order's, and do not average shared and unshared days into
one figure without saying so.

CONSUMPTION IS PER PIECE SHIPPED
\`perPiece\` is total issued divided by the pieces that actually left the factory, not by the
contracted quantity. On an order that shipped short, consumption per piece is correspondingly
high — that is real, and it is usually the most interesting thing on the screen. The piece
count travels with the figure; quote both.

MATCH PERCENTAGE IS SIMILARITY, NOT SUITABILITY
A 92% match means two styles look alike on the attributes recorded. It says nothing about
whether that order's price is the right price now — yarn rates, the buyer and the season all
moved. Offer the history; let the merchandiser decide what it implies.

WHAT NOT TO DO
Never seed a cost sheet on your own initiative, and never state a consumption figure for a
style with no compiled outcome. If the only figures available are estimates off a tech pack,
say that they are estimates.`,
  },
})
