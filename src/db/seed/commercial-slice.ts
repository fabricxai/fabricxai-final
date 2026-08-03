/**
 * 2.1/2.2 Commercial seed slice — the bank instruments and the bonded position.
 *
 * The shapes here are the ones that actually cause trouble in a factory, because a demo
 * where every instrument is healthy teaches nobody what the screens are for:
 *
 *  - **UD-118 is comfortable.** Most of its balance is intact; issues clear against it.
 *  - **UD-124 is nearly out.** Enough left to tempt somebody, not enough for a real lay —
 *    which is the state the blocked-issue card exists for, and the one a trial draw catches
 *    a day before the floor does.
 *  - **The master LC's latest-shipment date sits close to the order's ex-factory date.**
 *    Latest shipment is when goods must be ON the vessel; expiry is when documents must be
 *    AT the bank. Meeting one and missing the other still means not being paid, and the
 *    register's countdown is built to shout about exactly that gap.
 *
 * Everything goes through the real services, so the seed exercises the same validation,
 * events and audit rows the product does.
 */
import { and, eq } from 'drizzle-orm'

import { roles } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { lcs, uds } from '@/modules/commercial/schema'
import { createLc, createUd } from '@/modules/commercial/service'
import type { RequestCtx } from '@/modules/core/ctx'
import { orders } from '@/modules/orders/schema'

import type { SeedContext, SeedSlice } from './types'

const today = () => new Date().toISOString().slice(0, 10)

function daysFrom(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Two declarations, deliberately in different states.
 *
 * Quantities are in the units the customs paperwork actually uses — yards for woven
 * shirting, kilograms for yarn. The unit is part of the authorisation, not a display
 * choice: a UD authorising 40,000 yards does not authorise 40,000 metres.
 */
const DECLARATIONS = [
  {
    number: 'UD-118',
    validInDays: 96,
    items: [
      { itemRef: 'Woven shirting 40s poplin · HS 5208.32', qty: '42000.00', unit: 'yd' },
      { itemRef: 'Interlining fusible · HS 5903.10', qty: '6200.00', unit: 'yd' },
    ],
  },
  {
    // Nearly exhausted, and its validity is close. Both of the workbench's warnings.
    number: 'UD-124',
    validInDays: 24,
    items: [
      { itemRef: 'Cotton yarn 30s combed · HS 5205.23', qty: '18500.00', unit: 'kg' },
      { itemRef: 'Elastane 40D · HS 5402.44', qty: '640.00', unit: 'kg' },
    ],
  },
] as const

export const COMMERCIAL_SLICE: SeedSlice = {
  id: 'commercial',

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
      roles: ['commercial'],
    }

    // ── Utilization declarations ────────────────────────────────────────────
    let declarations = 0
    for (const spec of DECLARATIONS) {
      const [existing] = await ctx.db
        .select({ id: uds.id })
        .from(uds)
        .where(and(eq(uds.companyId, ctx.companyId), eq(uds.number, spec.number)))
      if (existing) continue

      await createUd(requestCtx, {
        number: spec.number,
        issueDate: daysFrom(day, -60),
        validUntil: daysFrom(day, spec.validInDays),
        authorizedItems: spec.items.map((i) => ({ ...i })),
      })
      declarations += 1
    }
    counts.uds = declarations

    // ── Letters of credit ───────────────────────────────────────────────────
    const [buyer] = await ctx.db
      .select({ id: buyers.id, name: buyers.name })
      .from(buyers)
      .where(eq(buyers.companyId, ctx.companyId))
    if (!buyer) return counts

    const [order] = await ctx.db
      .select({ id: orders.id, exFactory: orders.plannedExFactoryDate })
      .from(orders)
      .where(eq(orders.companyId, ctx.companyId))

    // Latest shipment three days after the order is due out of the factory. That is a
    // normal, survivable margin — and the exact margin that disappears the moment sewing
    // slips, which is what makes the countdown worth watching rather than decorative.
    const exFactory = order?.exFactory ?? daysFrom(day, 34)
    const latestShipment = daysFrom(exFactory, 3)

    const MASTER = {
      number: 'LC-2026-517',
      value: '128400.00',
      currency: 'USD',
      tolerancePct: '5.00',
      latestShipmentDate: latestShipment,
      // Documents are due at the bank 21 days after shipment — the usual presentation
      // period, and the reason expiry is not the same date as latest shipment.
      expiryDate: daysFrom(latestShipment, 21),
      docsRequired: {
        commercial_invoice: true,
        packing_list: true,
        bl: true,
        certificate_of_origin: true,
        inspection_certificate: true,
      },
    }

    const [existingLc] = await ctx.db
      .select({ id: lcs.id })
      .from(lcs)
      .where(and(eq(lcs.companyId, ctx.companyId), eq(lcs.number, MASTER.number)))

    if (!existingLc) {
      await createLc(requestCtx, {
        buyerId: buyer.id,
        number: MASTER.number,
        value: MASTER.value,
        currency: MASTER.currency,
        tolerancePct: MASTER.tolerancePct,
        issueDate: daysFrom(day, -40),
        latestShipmentDate: MASTER.latestShipmentDate,
        expiryDate: MASTER.expiryDate,
        docsRequired: MASTER.docsRequired,
      })
      counts.lcs = 1
    } else {
      counts.lcs = 0
    }

    return counts
  },
}
