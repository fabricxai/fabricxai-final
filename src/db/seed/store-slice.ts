/**
 * 3.1 Store seed slice — fabric and trims as a real store holds them.
 *
 * The shape matters more than the volume. A fabric store is roll-level: you do not issue
 * "80 metres of navy", you issue roll R-4471 which happens to hold 80. So the ledger here
 * is rolls, and every quantity the screen shows is derived from them rather than stored.
 *
 * Three situations the screen exists to show are seeded deliberately:
 *
 *  - **A shade-group split.** The poplin arrives in two dye lots. Cutting them together is
 *    how a garment leaves with two different navies in it, and the store screen is where
 *    that is visible before the lay is spread rather than after.
 *  - **An over-reservation.** More interlining is promised to requisitions than exists on
 *    the floor. That is a real state, not a corrupt one — two orders were sized against the
 *    same stock — and `overReserved` is the flag the header counts.
 *  - **A pending inspection.** A GRN received but not yet checked, because the gap between
 *    "it arrived" and "it is usable" is where a factory loses three days.
 *
 * Idempotent like every slice: deterministic ids derived from the company id, and
 * `onConflictDoNothing` throughout, so a second run changes nothing.
 */
import { and, eq } from 'drizzle-orm'

import { orders } from '@/modules/orders/schema'
import {
  grnLines,
  grns,
  issueLines,
  issues,
  items,
  locations,
  requisitionLines,
  requisitions,
  rolls,
} from '@/modules/store/schema'

import type { SeedContext, SeedSlice } from './types'

/** Relative to the run, so the story reads the same whenever it is seeded. */
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

const LOCATIONS = [
  ['BOND-1', 'Bonded store · ground floor', 'bonded'],
  ['GEN-1', 'General store · ground floor', 'general'],
  ['FLR-CUT', 'Cutting floor issue point', 'floor'],
] as const

const ITEMS = [
  ['FAB-POP-40S', 'fabric', '40s poplin · navy', 'm', { construction: '133x72', gsm: '118', width: '58"' }],
  ['FAB-PIQ-180', 'fabric', '180 gsm pique · white', 'm', { construction: 'single pique', gsm: '180', width: '60"' }],
  ['FAB-INT-45', 'fabric', 'fusible interlining · 45 gsm', 'm', { gsm: '45', width: '44"' }],
  ['TRM-BTN-18L', 'trim', 'polyester button 18L · navy', 'pcs', { ligne: '18L', holes: '4' }],
  ['TRM-THR-40', 'trim', 'sewing thread 40/2 · navy', 'cone', { count: '40/2' }],
  ['TRM-LBL-MAIN', 'trim', 'main label · woven', 'pcs', { type: 'woven' }],
  ['ACC-POLY-1', 'accessory', 'poly bag 10x14', 'pcs', { size: '10x14' }],
] as const

/**
 * Receipts. `inspection` left pending on the second one on purpose — see the file note.
 * Quantities are the ones the demo order actually needs: 24,000 shirts at ~1.55 m.
 */
const RECEIPTS = [
  {
    challan: 'CH-2026-0412',
    received: day(-12),
    inspection: 'passed' as const,
    lines: [
      // Two dye lots of the same fabric: the shade-group split.
      { item: 'FAB-POP-40S', qty: '21000.00', unit: 'm', price: '1.42', rolls: 14, lot: 'L-8841', dye: 'DL-A', shade: 'A', location: 'GEN-1' },
      { item: 'FAB-POP-40S', qty: '17400.00', unit: 'm', price: '1.42', rolls: 12, lot: 'L-8842', dye: 'DL-B', shade: 'B', location: 'GEN-1' },
    ],
  },
  {
    challan: 'CH-2026-0418',
    received: day(-5),
    inspection: 'pending' as const,
    lines: [
      { item: 'FAB-INT-45', qty: '2600.00', unit: 'm', price: '0.38', rolls: 4, lot: 'L-2210', dye: null, shade: null, location: 'GEN-1' },
      { item: 'TRM-BTN-18L', qty: '160000.00', unit: 'pcs', price: '0.01', rolls: 8, lot: 'B-5521', dye: null, shade: null, location: 'GEN-1' },
    ],
  },
  {
    challan: 'CH-2026-0421',
    received: day(-2),
    inspection: 'passed' as const,
    lines: [
      { item: 'TRM-THR-40', qty: '900.00', unit: 'cone', price: '0.85', rolls: 6, lot: 'T-1180', dye: null, shade: null, location: 'GEN-1' },
      { item: 'TRM-LBL-MAIN', qty: '26000.00', unit: 'pcs', price: '0.02', rolls: 3, lot: 'M-7742', dye: null, shade: null, location: 'GEN-1' },
      { item: 'ACC-POLY-1', qty: '25000.00', unit: 'pcs', price: '0.03', rolls: 3, lot: 'P-9910', dye: null, shade: null, location: 'GEN-1' },
    ],
  },
] as const

export const STORE_SLICE: SeedSlice = {
  id: 'store',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const short = ctx.companyId.slice(0, 8)
    const counts: Record<string, number> = {}

    // ── Locations ────────────────────────────────────────────────────────────
    for (const [code, name, kind] of LOCATIONS) {
      await ctx.db
        .insert(locations)
        .values({ companyId: ctx.companyId, code, name, kind })
        .onConflictDoNothing()
    }
    counts.locations = LOCATIONS.length

    // ── Items ────────────────────────────────────────────────────────────────
    for (const [code, kind, name, uom, spec] of ITEMS) {
      await ctx.db
        .insert(items)
        .values({ companyId: ctx.companyId, code, kind, name, uom, spec })
        .onConflictDoNothing()
    }
    counts.items = ITEMS.length

    const itemByCode = new Map(
      (await ctx.db
        .select({ id: items.id, code: items.code })
        .from(items)
        .where(eq(items.companyId, ctx.companyId))).map((r) => [r.code, r.id]),
    )
    const locationByCode = new Map(
      (await ctx.db
        .select({ id: locations.id, code: locations.code })
        .from(locations)
        .where(eq(locations.companyId, ctx.companyId))).map((r) => [r.code, r.id]),
    )

    // ── Receipts, their lines, and the rolls they became ─────────────────────
    let rollCount = 0
    let lineCount = 0

    for (const receipt of RECEIPTS) {
      const [grn] = await ctx.db
        .insert(grns)
        .values({
          companyId: ctx.companyId,
          challanNo: receipt.challan,
          receivedAt: receipt.received,
          // Bonded receipts need a UD, which module 2.2 owns — the commercial slice seeds
          // those. A bonded GRN with no UD would not survive the check constraint anyway.
          bonded: false,
          inspectionStatus: receipt.inspection,
          createdBy: `seed-${short}-store`,
        })
        .onConflictDoNothing()
        .returning({ id: grns.id })

      // Already seeded on an earlier run.
      if (!grn) continue

      for (const line of receipt.lines) {
        const itemId = itemByCode.get(line.item)
        const locationId = locationByCode.get(line.location)
        if (!itemId || !locationId) continue

        const [grnLine] = await ctx.db
          .insert(grnLines)
          .values({
            companyId: ctx.companyId,
            grnId: grn.id,
            itemId,
            qty: line.qty,
            unit: line.unit,
            unitPrice: line.price,
            currency: 'USD',
          })
          .returning({ id: grnLines.id })
        if (!grnLine) continue
        lineCount += 1

        // The line's quantity spread across its rolls, with the remainder on the last one
        // so the roll total reconciles to the receipt exactly. A store whose rolls do not
        // add up to its GRN is a store nobody trusts.
        const per = Math.floor((Number(line.qty) / line.rolls) * 100) / 100
        for (let i = 0; i < line.rolls; i += 1) {
          const isLast = i === line.rolls - 1
          const qty = isLast ? (Number(line.qty) - per * (line.rolls - 1)).toFixed(2) : per.toFixed(2)

          await ctx.db
            .insert(rolls)
            .values({
              companyId: ctx.companyId,
              grnLineId: grnLine.id,
              itemId,
              rollNo: `${line.lot}-${String(i + 1).padStart(3, '0')}`,
              lot: line.lot,
              dyeLot: line.dye,
              shadeGroup: line.shade,
              qty,
              unit: line.unit,
              locationId,
              status: 'in_stock',
            })
            .onConflictDoNothing()
          rollCount += 1
        }
      }
    }

    counts.grns = RECEIPTS.length
    counts.grn_lines = lineCount
    counts.rolls = rollCount

    // ── Reservations, including one that over-promises ───────────────────────
    // Requisitions are what make stock "reserved", so without them the screen can only
    // show on-hand and the difference the module exists to teach is invisible.
    const [order] = await ctx.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.companyId, ctx.companyId))
      .limit(1)

    if (order) {
      const existing = await ctx.db
        .select({ id: requisitions.id })
        .from(requisitions)
        .where(
          and(eq(requisitions.companyId, ctx.companyId), eq(requisitions.orderId, order.id)),
        )

      if (existing.length === 0) {
        const [requisition] = await ctx.db
          .insert(requisitions)
          .values({
            companyId: ctx.companyId,
            orderId: order.id,
            status: 'open',
            basis: { pieces: 24000, consumptionPerPiece: '1.55', wastagePct: '4' },
            createdBy: `seed-${short}-store`,
          })
          .returning({ id: requisitions.id })

        if (requisition) {
          // Two over-reservations, for two different reasons — which is the point, because
          // they are fixed differently.
          const reservations = [
            // 24,000 pcs × 1.55 m + 4% wastage = 38,688 m required against 38,400 received.
            // 288 m short: the booking was right and the mill under-delivered. Somebody
            // chases the supplier.
            { item: 'FAB-POP-40S', required: '38688.00', issued: '0', unit: 'm' },
            // 3,100 m promised against 2,600 m received. Two orders were sized against the
            // same interlining and nobody reconciled them. Somebody re-plans.
            { item: 'FAB-INT-45', required: '3100.00', issued: '0', unit: 'm' },
            // Comfortably covered — most lines are fine, and a screen where everything is
            // red teaches nothing about which line to look at.
            { item: 'TRM-BTN-18L', required: '150000.00', issued: '0', unit: 'pcs' },
          ]

          for (const reservation of reservations) {
            const itemId = itemByCode.get(reservation.item)
            if (!itemId) continue
            await ctx.db
              .insert(requisitionLines)
              .values({
                companyId: ctx.companyId,
                requisitionId: requisition.id,
                itemId,
                requiredQty: reservation.required,
                issuedQty: reservation.issued,
                unit: reservation.unit,
              })
              .onConflictDoNothing()
          }
          counts.requisitions = 1
          counts.requisition_lines = reservations.length

        }
      }
    }

    // ── What actually left the store ─────────────────────────────────────────
    // Guarded on its own existence, not on the requisition's. Nesting it inside the
    // "requisition was just created" branch meant a second seed run skipped it entirely —
    // the requisition already existed, so the issue never happened and cutting stayed
    // blocked on a store that looked full.
    const [anyRequisition] = await ctx.db
      .select({ id: requisitions.id, orderId: requisitions.orderId })
      .from(requisitions)
      .where(eq(requisitions.companyId, ctx.companyId))
      .limit(1)

    if (anyRequisition) {
      const requisitionId = anyRequisition.id
      const alreadyIssued = await ctx.db
        .select({ id: issues.id })
        .from(issues)
        .where(eq(issues.companyId, ctx.companyId))

      if (alreadyIssued.length === 0) {
        const order = { id: anyRequisition.orderId }
      // ── What actually left the store ────────────────────────────────
      // Cutting may only draw rolls the store ISSUED to this order — the gate refuses
      // anything else. Without this the floor chain breaks at the first door: the
      // cutting screen would correctly report "no fabric issued" and no lay could be
      // spread, which looks like a broken screen rather than a finished demo.
      const poplinId = itemByCode.get('FAB-POP-40S')
      const poplinLine = await ctx.db
        .select({ id: requisitionLines.id })
        .from(requisitionLines)
        .where(
          and(
            eq(requisitionLines.requisitionId, requisitionId),
            poplinId ? eq(requisitionLines.itemId, poplinId) : undefined,
          ),
        )

      if (poplinId && poplinLine.length > 0) {
        // Shade A only. Issuing both dye lots would put two navies on one table, which
        // is the mistake the store screen exists to prevent — the seed should not model
        // the factory doing it.
        const shadeA = await ctx.db
          .select({ id: rolls.id, qty: rolls.qty, unit: rolls.unit })
          .from(rolls)
          .where(
            and(
              eq(rolls.companyId, ctx.companyId),
              eq(rolls.itemId, poplinId),
              eq(rolls.shadeGroup, 'A'),
              eq(rolls.status, 'in_stock'),
            ),
          )
          // More than the seeded lays consume, so a cutter opening the lay screen has
          // fabric to spread. A store that has issued exactly what is already on the
          // tables leaves the next lay with nothing, which reads as a broken screen.
          .limit(12)

        if (shadeA.length > 0) {
          const [issue] = await ctx.db
            .insert(issues)
            .values({
              companyId: ctx.companyId,
              requisitionId,
              orderId: order.id,
              createdBy: `seed-${short}-store`,
            })
            .returning({ id: issues.id })

          if (issue) {
            let issued = 0
            for (const roll of shadeA) {
              await ctx.db.insert(issueLines).values({
                companyId: ctx.companyId,
                issueId: issue.id,
                itemId: poplinId,
                rollId: roll.id,
                qty: roll.qty,
                unit: roll.unit,
              })
              // The roll is on the floor now, not in the store.
              await ctx.db
                .update(rolls)
                .set({ status: 'issued', updatedAt: new Date() })
                .where(eq(rolls.id, roll.id))
              issued += Number(roll.qty)
            }

            await ctx.db
              .update(requisitionLines)
              .set({ issuedQty: issued.toFixed(2), updatedAt: new Date() })
              .where(eq(requisitionLines.id, poplinLine[0]!.id))

            counts.issues = 1
            counts.issue_lines = shadeA.length
          }
        }
      }
      }
    }

    return counts
  },
}
