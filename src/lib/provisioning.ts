/**
 * What a brand-new factory gets.
 *
 * One place answering "what does a company need before anybody can use it?", called from the
 * signup hook. It lives at the composition edge rather than in `modules/core` on purpose:
 * core is what modules depend on, so core importing three module services would invert the
 * dependency the registry exists to keep pointing one way.
 *
 * Three properties, and each is deliberate:
 *
 *  1. **Every step is idempotent and non-destructive.** Re-provisioning a company leaves
 *     anything it has customised alone. A factory that retuned its lead times must not have
 *     them clobbered by a re-run.
 *  2. **A failure does not break signup.** These are convenience defaults, not the tenant
 *     itself. Failing signup because a default calendar could not be written would leave
 *     somebody unable to get in at all — and unable to retry, because their email and slug
 *     are already taken. Each step is reported, and the caller decides what to do with a
 *     partial result.
 *  3. **Each module seeds its own tables.** This file calls service functions; it does not
 *     write another module's rows (rule 11).
 *
 * Without this, a fresh factory cannot lose an RFQ, record a defect, or give an order a
 * calendar — three things whose absence is confusing rather than obviously missing.
 */
import type { AnyCtx } from '@/modules/core/ctx'

export interface ProvisionStep {
  step: string
  ok: boolean
  created: number
  existing: number
  error?: string
}

export interface ProvisionResult {
  companyId: string
  steps: ProvisionStep[]
  /** False when any step failed. The tenant is still usable; something is just missing. */
  complete: boolean
}

/**
 * Give a company its starting reference data.
 *
 * Safe to call more than once — that is what makes it usable both from signup and from an
 * admin "repair this tenant" action.
 */
export async function provisionCompany(ctx: AnyCtx): Promise<ProvisionResult> {
  const steps: ProvisionStep[] = []

  const run = async (
    step: string,
    fn: () => Promise<{ created: string[]; existing: string[] }>,
  ): Promise<void> => {
    try {
      const result = await fn()
      steps.push({
        step,
        ok: true,
        created: result.created.length,
        existing: result.existing.length,
      })
    } catch (error) {
      // Reported, not thrown. See property 2 above.
      steps.push({
        step,
        ok: false,
        created: 0,
        existing: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // The calendars every order hangs off. 1.4's PP escalation, 7.1's readiness check and
  // 8.1's LC countdown all read milestones by name, so an order with no schedule is an
  // order none of them can see.
  const { seedDefaultTnaTemplates } = await import('@/modules/orders/service')
  await run('orders.tna_templates', () => seedDefaultTnaTemplates(ctx))

  // `markLost` refuses a code that is not in the table, so without this a new factory
  // cannot record why it lost an enquiry — the desk's most valuable output.
  const { seedDefaultLossReasons } = await import('@/modules/rfq/service')
  await run('rfq.loss_reasons', () => seedDefaultLossReasons(ctx))

  // Inline capture and final inspection both refuse an unknown code, so without this a new
  // factory cannot record a defect at all.
  const { seedDefaultDefectCodes } = await import('@/modules/quality/service')
  await run('quality.defect_codes', () => seedDefaultDefectCodes(ctx))

  return {
    companyId: ctx.companyId,
    steps,
    complete: steps.every((step) => step.ok),
  }
}
