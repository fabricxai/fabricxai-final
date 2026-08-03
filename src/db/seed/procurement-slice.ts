/**
 * 3.2 Procurement seed slice.
 *
 * Three suppliers and three quotes for the same fabric, arranged so the comparison has a
 * real decision in it rather than an obvious winner:
 *
 *  - **The cheapest unit price is not the cheapest landed cost.** An import mill quoting
 *    below the others carries duty and freight; add them and it moves. That is the whole
 *    reason the comparison ranks on landed cost, and a seed where the cheapest price also
 *    wins on landed cost would never show it.
 *  - **One quote is infeasible.** A 52-day lead time against fabric needed in five weeks
 *    is not a worse option, it is not an option — and the comparison separates it out
 *    rather than ranking it last, where somebody would eventually pick it.
 *  - **One supplier is `import`, one is `local`.** The BTB headroom gate fires on the first
 *    and not the second, which is the difference the PO screen exists to make visible.
 */
import { and, eq } from 'drizzle-orm'

import { roles } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import { orders } from '@/modules/orders/schema'
import {
  purchaseRequisitions,
  supplierQuotes,
  suppliers,
} from '@/modules/procurement/schema'
import {
  createPurchaseRequisition,
  createSupplier,
  recordSupplierQuote,
} from '@/modules/procurement/service'
import { items } from '@/modules/store/schema'

import type { SeedContext, SeedSlice } from './types'

const today = () => new Date().toISOString().slice(0, 10)

function daysFrom(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

const SUPPLIERS = [
  {
    code: 'MILL-CN-01',
    name: 'Ningbo Yuhua Textile',
    type: 'fabric_mill' as const,
    origin: 'import' as const,
    defaultCurrency: 'USD',
    paymentTerms: 'BTB LC at 90 days',
  },
  {
    code: 'MILL-BD-04',
    name: 'Square Textiles Ltd.',
    type: 'fabric_mill' as const,
    origin: 'local' as const,
    defaultCurrency: 'BDT',
    paymentTerms: '30 days from delivery',
  },
  {
    code: 'TRIM-BD-09',
    name: 'Dhaka Trims & Accessories',
    type: 'trims' as const,
    origin: 'local' as const,
    defaultCurrency: 'BDT',
    paymentTerms: '45 days',
  },
] as const

/**
 * Per supplier: what they quoted for the fabric line.
 *
 * `leadTimeDays` is what decides feasibility, and 52 days against a five-week requirement
 * is the one that must not be rankable.
 */
const QUOTES = [
  // USD, from a Chinese mill: cheap on the sticker, then 12% duty and sea freight.
  { code: 'MILL-CN-01', unitPrice: '2.4200', leadTimeDays: 34, dutyPct: '12.00', freight: '1850.00' },
  // BDT, and quoted at BDT magnitudes — roughly 330 taka a metre, about 2.74 USD. Writing
  // 2.91 here (the USD-equivalent number) would have made the local mill look a hundred
  // times cheaper, which is exactly the kind of plausible-looking wrong number a comparison
  // screen must never produce from its own seed.
  { code: 'MILL-BD-04', unitPrice: '330.0000', leadTimeDays: 18, dutyPct: '0.00', freight: '28000.00' },
  { code: 'TRIM-BD-09', unitPrice: '316.0000', leadTimeDays: 52, dutyPct: '0.00', freight: '21000.00' },
] as const

export const PROCUREMENT_SLICE: SeedSlice = {
  id: 'procurement',

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
      roles: ['procurement'],
    }

    // ── Suppliers ───────────────────────────────────────────────────────────
    let created = 0
    for (const spec of SUPPLIERS) {
      const [existing] = await ctx.db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.companyId, ctx.companyId), eq(suppliers.code, spec.code)))
      if (existing) continue

      await createSupplier(requestCtx, {
        code: spec.code,
        name: spec.name,
        type: spec.type,
        origin: spec.origin,
        paymentTerms: spec.paymentTerms,
        defaultCurrency: spec.defaultCurrency,
        contacts: [],
      })
      created += 1
    }
    counts.suppliers = created

    // ── A requisition for the fabric ────────────────────────────────────────
    const [fabric] = await ctx.db
      .select({ id: items.id, uom: items.uom })
      .from(items)
      .where(and(eq(items.companyId, ctx.companyId), eq(items.kind, 'fabric')))
    if (!fabric) return counts

    const prNo = 'PR-2026-0088'
    const [existingPr] = await ctx.db
      .select({ id: purchaseRequisitions.id })
      .from(purchaseRequisitions)
      .where(and(eq(purchaseRequisitions.companyId, ctx.companyId), eq(purchaseRequisitions.prNo, prNo)))

    let prId = existingPr?.id ?? null
    if (!prId) {
      const [order] = await ctx.db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.companyId, ctx.companyId))

      const result = await createPurchaseRequisition(requestCtx, {
        ...(order ? { orderId: order.id } : {}),
        prNo,
        // Five weeks out — which is what makes the 52-day quote infeasible rather than
        // merely expensive.
        neededBy: daysFrom(day, 35),
        lines: [{ itemId: fabric.id, qty: '18000.00', unit: fabric.uom }],
      })
      prId = result.purchaseRequisitionId
      counts.purchase_requisitions = 1
    }

    // ── One quote per supplier ──────────────────────────────────────────────
    const supplierRows = await ctx.db
      .select({ id: suppliers.id, code: suppliers.code, currency: suppliers.defaultCurrency })
      .from(suppliers)
      .where(eq(suppliers.companyId, ctx.companyId))
    const byCode = new Map(supplierRows.map((s) => [s.code, s]))

    let quoted = 0
    for (const spec of QUOTES) {
      const supplier = byCode.get(spec.code)
      if (!supplier) continue

      const [existing] = await ctx.db
        .select({ id: supplierQuotes.id })
        .from(supplierQuotes)
        .where(
          and(
            eq(supplierQuotes.purchaseRequisitionId, prId),
            eq(supplierQuotes.supplierId, supplier.id),
          ),
        )
      if (existing) continue

      await recordSupplierQuote(requestCtx, {
        purchaseRequisitionId: prId,
        supplierId: supplier.id,
        // Quoted in the supplier's own currency — the comparison converts, and a seed that
        // quoted everyone in USD would never exercise that.
        currency: supplier.currency,
        quotedOn: daysFrom(day, -4),
        lines: [
          {
            itemId: fabric.id,
            unitPrice: spec.unitPrice,
            leadTimeDays: spec.leadTimeDays,
            moq: '5000.00',
            freight: spec.freight,
            dutyPct: spec.dutyPct,
          },
        ],
      })
      quoted += 1
    }
    counts.supplier_quotes = quoted

    return counts
  },
}
