/**
 * 11.1 Commercial finance seed slice.
 *
 * The books only teach anything if they are uneven. What is seeded here:
 *
 *  - **One invoice raised and unpaid**, dated far enough back that it sits in an ageing
 *    bucket rather than in "current". A receivables panel where everything is current is a
 *    panel nobody would ever open.
 *  - **Payables against real GRNs**, one already past due. The canvas is explicit that
 *    "no GRN, no payable — the row cannot be created at all", and the payload enforces it:
 *    a payable must reference either a supplier PO or a goods receipt, so a supplier
 *    cannot be paid for material nobody recorded arriving.
 *
 * Everything goes through the real services, so the receivable is raised by `draftInvoice`
 * with the expected date derived from the buyer's realization lag — not written by hand.
 */
import { and, desc, eq } from 'drizzle-orm'

import { roles } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import { draftInvoice, openPayable, type FinancePolicy } from '@/modules/finance/service'
import { invoices, payables } from '@/modules/finance/schema'
import { orders } from '@/modules/orders/schema'
import { grns } from '@/modules/store/schema'

import type { SeedContext, SeedSlice } from './types'

const today = () => new Date().toISOString().slice(0, 10)

function daysFrom(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

const SEED_FINANCE_POLICY: FinancePolicy = {
  defaultRealizationLagDays: 30,
  marginErosionPct: '2',
}

/** Payables against receipts, in the states an accounts desk actually holds. */
const PAYABLE_SPECS = [
  { reference: 'Mill invoice · woven shirting', amount: '38400.00', dueInDays: -6 },
  { reference: 'Trims · buttons and labels', amount: '4120.00', dueInDays: 4 },
  { reference: 'Yarn · combed cotton 30s', amount: '21750.00', dueInDays: 19 },
] as const

export const FINANCE_SLICE: SeedSlice = {
  id: 'finance',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    const day = today()

    const [owner] = await ctx.db
      .select({ userId: roles.userId })
      .from(roles)
      .where(and(eq(roles.companyId, ctx.companyId), eq(roles.role, 'owner')))
    if (!owner) return counts

    const requestCtx: RequestCtx = {
      companyId: ctx.companyId,
      userId: owner.userId,
      roles: ['finance'],
    }

    // ── An invoice, already ageing ──────────────────────────────────────────
    const [order] = await ctx.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.companyId, ctx.companyId))

    let invoiced = 0
    if (order) {
      const number = 'INV-2026-0431'
      const [existing] = await ctx.db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.companyId, ctx.companyId), eq(invoices.number, number)))

      if (!existing) {
        // Dated 44 days back against 30-day terms, so it lands in the 1–30 day bucket
        // rather than looking current — the state a finance manager is chasing.
        await draftInvoice(
          requestCtx,
          {
            orderId: order.id,
            number,
            invoiceDate: daysFrom(day, -44),
            value: '128400.00',
            currency: 'USD',
          },
          SEED_FINANCE_POLICY,
        )
        invoiced = 1
      }
    }
    counts.invoices = invoiced

    // ── Payables, each against a receipt ────────────────────────────────────
    const receipts = await ctx.db
      .select({ id: grns.id })
      .from(grns)
      .where(eq(grns.companyId, ctx.companyId))
      .orderBy(desc(grns.receivedAt))
    if (receipts.length === 0) return counts

    let opened = 0
    for (const [index, spec] of PAYABLE_SPECS.entries()) {
      const [existing] = await ctx.db
        .select({ id: payables.id })
        .from(payables)
        .where(and(eq(payables.companyId, ctx.companyId), eq(payables.reference, spec.reference)))
      if (existing) continue

      await openPayable(requestCtx, {
        // Every payable points at the receipt that justifies it. Without one the payload
        // refuses — see the file note.
        grnId: receipts[index % receipts.length]!.id,
        reference: spec.reference,
        amount: spec.amount,
        currency: 'USD',
        dueAt: daysFrom(day, spec.dueInDays),
      })
      opened += 1
    }
    counts.payables = opened

    return counts
  },
}
