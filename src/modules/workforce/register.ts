/**
 * Module registration for 10.1 🔒
 *
 * `wage_gazettes` is the ONLY pending target, and even that is narrow: MARBIM may
 * transcribe a scanned government notification into a draft gazette, which lands as
 * `draft` and must still be activated by hr or the owner.
 *
 * Everything else is absent on purpose. `payroll_lines` and `payroll_runs` are computed
 * by a pure function from attendance and the pinned gazette — a draft that could write a
 * payroll line directly would let an AI set what a person is paid, with no attendance
 * behind it and no recompute that would reproduce it. `workers` and `attendance` are
 * absent for the same reason one step back: a drafted attendance row is a drafted wage.
 */
import { registerModule } from '../core/registry'

import { workforceToolPack } from './tools'

import { WORKFORCE_ZOD_MAP } from './zod'

export const workforceModule = registerModule({
  id: 'workforce',

  pendingTargets: ['wage_gazettes'],
  zodMap: WORKFORCE_ZOD_MAP,

  /**
   * 🔒 Deliberately smaller than the module: headcount and roster carry no money, and the
   * gazette and run list are rates and totals behind `assertPayrollAccess`. No per-worker
   * pay — a chat answer is persisted in `chat_turns`, which would copy a wage out from
   * under the protection `payroll_lines` gives it.
   */
  toolPack: workforceToolPack,

  /**
   * A gazette is a header AND its grade table. Core's generic write would insert the
   * header alone — and a gazette with no grades activates cleanly, then pays nothing —
   * quite apart from refusing `effectiveFrom` as an invalid column identifier.
   *
   * Lazily imported: a static import of the service here puts this file in the service's
   * evaluation graph, which is how commercial ended up registered twice.
   */
  commitHandlers: {
    wage_gazettes: async (ctx, tx, input) => {
      const { commitGazetteFromScan } = await import('./service')
      return commitGazetteFromScan(ctx, tx, input)
    },
  },

  // 🔒 Nobody but hr and the owner approves anything in this module.
  approvalDefaults: { requiredRoles: ['owner', 'hr'] },

  domainPrimer: {
    version: '10.1.0',
    text: `You are helping the HR and payroll team of a Bangladeshi garment factory.

WHAT YOU MUST NEVER DO
- Never state, estimate or recompute anyone's wage. Payroll is restricted to HR and the
  owner. If the person you are talking to can see a figure, they got it from the system,
  not from you.
- Never quote a minimum wage rate from memory. Rates come from the factory's own uploaded
  gazette and change by government notification. If you are asked what a grade pays, read
  the active gazette through a tool or say you cannot.
- Never suggest a payroll run be adjusted after approval. An approved run is what people
  were told they would receive; a correction is a separate adjustment in the next period,
  and saying otherwise invites someone to quietly rewrite a paid figure.

WHAT IS WORTH SAYING
- Overtime is paid at twice the basic hourly rate, and the hourly rate is basic divided
  by 208. That is law, not factory policy, and it is safe to explain.
- Two festival bonuses a year, pro-rated for workers with less than the qualifying
  service.
- A flagged line has not been withheld. It has been paid and marked for a supervisor to
  look at — say that plainly, because "flagged" sounds like "blocked" and it is not.

DRAFTING
You may transcribe a scanned wage gazette into a draft. Attach the per-field confidence
your extraction produced. A wrong digit in a basic rate is a wrong payslip for everyone
on that grade, so say clearly which figures you were unsure of.`,
  },
})
