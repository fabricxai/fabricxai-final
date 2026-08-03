/**
 * 8.1 Shipment seed slice.
 *
 * One shipment, deliberately incomplete: no EXP number, no confirmed ex-factory, and
 * finished pieces on the floor with only some of them packed.
 *
 * That is the state the screens exist for. A seeded shipment that is already ready to
 * present demonstrates nothing — the EXP gate never fires, the packing list is already
 * locked, and the blockers list a shipping clerk actually works through is empty. What is
 * useful is a shipment somebody still has to finish.
 *
 * Finishing output is seeded ahead of cartons so the packing floor has something to pack,
 * and deliberately more than is packed, so the grid has remainders rather than a wall of
 * zeroes.
 */
import { and, eq } from 'drizzle-orm'

import { roles } from '@/db/schema/core'
import { lcs } from '@/modules/commercial/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { orderBreakdowns, orderStyles, orders } from '@/modules/orders/schema'
import { cartons, shipments } from '@/modules/shipment/schema'
import { createShipment, packCarton, recordFinishingOutput } from '@/modules/shipment/service'

import type { SeedContext, SeedSlice } from './types'

const today = () => new Date().toISOString().slice(0, 10)

function daysFrom(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** 24 to a carton, one colour and size each — the canvas's carton. */
const CARTON_SIZE = 24
/** Cells to pack fully, leaving the rest as a remainder the floor still has to work through. */
const CARTONS_PER_CELL = 3

export const SHIPMENT_SLICE: SeedSlice = {
  id: 'shipment',

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
      roles: ['shipment'],
    }

    const [order] = await ctx.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.companyId, ctx.companyId))
    if (!order) return counts

    const [style] = await ctx.db
      .select({ id: orderStyles.id, revision: orderStyles.activeRevision })
      .from(orderStyles)
      .where(eq(orderStyles.orderId, order.id))

    // ── The shipment ────────────────────────────────────────────────────────
    const [existing] = await ctx.db
      .select({ id: shipments.id })
      .from(shipments)
      .where(and(eq(shipments.companyId, ctx.companyId), eq(shipments.orderId, order.id)))

    if (!existing) {
      const [lc] = await ctx.db
        .select({ id: lcs.id })
        .from(lcs)
        .where(eq(lcs.companyId, ctx.companyId))

      await createShipment(requestCtx, {
        orderId: order.id,
        ...(lc ? { lcId: lc.id } : {}),
        partialNo: 1,
        plannedExFactory: daysFrom(day, 33),
        forwarder: 'Maersk · Chattogram',
        mode: 'sea',
      })
      counts.shipments = 1
    }

    // ── Finished pieces, then cartons against some of them ──────────────────
    if (!style) return counts

    const cells = await ctx.db
      .select({ color: orderBreakdowns.color, size: orderBreakdowns.size })
      .from(orderBreakdowns)
      .where(
        and(
          eq(orderBreakdowns.orderStyleId, style.id),
          eq(orderBreakdowns.revision, style.revision),
        ),
      )
    if (cells.length === 0) return counts

    const [alreadyPacked] = await ctx.db
      .select({ id: cartons.id })
      .from(cartons)
      .where(and(eq(cartons.companyId, ctx.companyId), eq(cartons.orderId, order.id)))
    if (alreadyPacked) return counts

    // Enough finished for four cartons a cell; three get packed. The fourth is the
    // remainder the packing screen shows as still to do.
    const finished: Record<string, number> = {}
    for (const cell of cells) {
      finished[`${cell.color}|${cell.size}`] = CARTON_SIZE * (CARTONS_PER_CELL + 1)
    }

    await recordFinishingOutput(requestCtx, {
      orderId: order.id,
      orderStyleId: style.id,
      outputDate: daysFrom(day, -1),
      cells: finished,
    })
    counts.finishing_outputs = 1

    let packed = 0
    for (const cell of cells) {
      const key = `${cell.color}|${cell.size}`
      for (let n = 0; n < CARTONS_PER_CELL; n += 1) {
        await packCarton(requestCtx, {
          orderId: order.id,
          cartonNo: `C-${key.replace(/[^A-Za-z0-9]/g, '')}-${String(n + 1).padStart(2, '0')}`,
          contents: { [key]: CARTON_SIZE },
          grossKg: '12.40',
          netKg: '11.20',
        })
        packed += 1
      }
    }
    counts.cartons = packed

    return counts
  },
}
