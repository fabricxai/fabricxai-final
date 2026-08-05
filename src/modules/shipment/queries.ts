/**
 * Read models for Shipment.
 *
 * The screen exists to answer "can this actually go to the bank" before anyone
 * tries. Two things stop it, and they fail differently:
 *
 *  - **No EXP number.** Mandatory per export shipment under Bangladesh Bank
 *    rules. Without it the presentation cannot legally be made at all, so this
 *    is a hard block rather than a missing field.
 *  - **An incomplete document set.** The checklist comes from the LC's own
 *    `docs_required`, so a missing document is the buyer's requirement unmet,
 *    not an internal tidiness problem.
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'

import { lcs } from '@/modules/commercial/schema'
import type { AnyCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'
import { orders } from '@/modules/orders/schema'

import { cartons, packingLists, shipmentDocs, shipments } from './schema'

// Cartons packed but not yet loaded are read through the service's own
// `unloadedCartons` rather than re-queried here — one definition of "unloaded".

export type PortStatus = 'planned' | 'ex_factory' | 'at_port' | 'on_board' | 'delivered'

export interface ShipmentRow {
  id: string
  /** The order this ships against — every desk action needs it. */
  orderId: string
  partialNo: number
  poNumber: string | null
  lcNumber: string | null
  /** The LC's own deadline for goods leaving. */
  latestShipmentDate: string | null
  plannedExFactory: string | null
  actualExFactory: string | null
  forwarder: string | null
  bookingRef: string | null
  expNumber: string | null
  blAwb: string | null
  mode: string
  portStatus: PortStatus
  cartonCount: number
  /** Packed against the order but not yet loaded onto any shipment. */
  unloadedCartons: number
  packedQty: number
  packingList: {
    /** Carried so approving one does not require a second lookup by version. */
    id: string
    version: number
    status: string
    totalCartons: number
    totalQty: number
  } | null
  docs: { kind: string; status: string; hasFile: boolean }[]
  /** Everything blocking a bank submission, in the order somebody must fix them. */
  blockers: string[]
  /** Days between actual (or planned) ex-factory and the LC deadline. */
  daysAgainstLatestShipment: number | null
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime()
  const to = new Date(`${toIso}T00:00:00Z`).getTime()
  return Math.round((to - from) / 86_400_000)
}

export async function shipmentBoard(ctx: AnyCtx): Promise<ShipmentRow[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: shipments.id,
        partialNo: shipments.partialNo,
        orderId: shipments.orderId,
        lcId: shipments.lcId,
        plannedExFactory: shipments.plannedExFactory,
        actualExFactory: shipments.actualExFactory,
        forwarder: shipments.forwarder,
        bookingRef: shipments.bookingRef,
        expNumber: shipments.expNumber,
        blAwb: shipments.blAwb,
        mode: shipments.mode,
        portStatus: shipments.portStatus,
      })
      .from(shipments)
      .orderBy(desc(shipments.createdAt))
      .limit(100)

    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const orderIds = [...new Set(rows.map((r) => r.orderId).filter((id): id is string => !!id))]
    const lcIds = [...new Set(rows.map((r) => r.lcId).filter((id): id is string => !!id))]

    const [cartonRows, unloadedRows, listRows, docRows, orderRows, lcRows] = await Promise.all([
      tx
        .select({ shipmentId: cartons.shipmentId, totalQty: cartons.totalQty })
        .from(cartons)
        .where(inArray(cartons.shipmentId, ids)),
      // Cartons packed against these orders that no shipment has claimed yet. Counted
      // separately because "packed" and "loaded" are different facts — a pallet on the
      // floor is not in the container, and only the loaded ones are on the manifest.
      tx
        .select({ orderId: cartons.orderId, id: cartons.id })
        .from(cartons)
        .where(and(inArray(cartons.orderId, orderIds), isNull(cartons.shipmentId))),
      tx
        .select({
          id: packingLists.id,
          shipmentId: packingLists.shipmentId,
          version: packingLists.version,
          status: packingLists.status,
          totalCartons: packingLists.totalCartons,
          totalQty: packingLists.totalQty,
        })
        .from(packingLists)
        .where(inArray(packingLists.shipmentId, ids))
        .orderBy(desc(packingLists.version)),
      tx
        .select({
          shipmentId: shipmentDocs.shipmentId,
          kind: shipmentDocs.kind,
          status: shipmentDocs.status,
          documentId: shipmentDocs.documentId,
        })
        .from(shipmentDocs)
        .where(inArray(shipmentDocs.shipmentId, ids))
        .orderBy(asc(shipmentDocs.kind)),
      orderIds.length > 0
        ? tx
            .select({ id: orders.id, poNumbers: orders.poNumbers })
            .from(orders)
            .where(inArray(orders.id, orderIds))
        : Promise.resolve([] as { id: string; poNumbers: string[] | null }[]),
      lcIds.length > 0
        ? tx
            .select({
              id: lcs.id,
              number: lcs.number,
              latestShipmentDate: lcs.latestShipmentDate,
            })
            .from(lcs)
            .where(inArray(lcs.id, lcIds))
        : Promise.resolve([] as { id: string; number: string; latestShipmentDate: string | null }[]),
    ])

    return rows.map((r): ShipmentRow => {
      const myCartons = cartonRows.filter((c) => c.shipmentId === r.id)
      // Highest version is the live one; earlier versions are superseded history.
      const list = listRows.find((l) => l.shipmentId === r.id) ?? null
      const docs = docRows
        .filter((d) => d.shipmentId === r.id)
        // `hasFile` rather than the id: the screen only needs to know whether the document
        // can be marked ready, and passing an id it has no use for invites somebody to
        // start addressing documents by it from the client.
        .map((d) => ({ kind: d.kind, status: d.status, hasFile: d.documentId !== null }))
      const lc = lcRows.find((l) => l.id === r.lcId) ?? null

      const blockers: string[] = []
      // Order matters: the EXP number is the legal blocker, everything else is
      // a completeness one, and fixing them in the wrong order wastes a day.
      if (!r.expNumber) blockers.push('no EXP number')
      if (!list) blockers.push('no packing list')
      else if (list.status !== 'approved') blockers.push('packing list not approved')

      const pending = docs.filter((d) => d.status !== 'submitted' && d.status !== 'ready')
      if (docs.length === 0) blockers.push('no document checklist')
      else if (pending.length > 0) blockers.push(`${pending.length} documents not ready`)

      const against =
        lc?.latestShipmentDate && (r.actualExFactory ?? r.plannedExFactory)
          ? daysBetween(r.actualExFactory ?? r.plannedExFactory!, lc.latestShipmentDate)
          : null

      return {
        id: r.id,
        orderId: r.orderId,
        unloadedCartons: unloadedRows.filter((c) => c.orderId === r.orderId).length,
        partialNo: r.partialNo,
        poNumber: orderRows.find((o) => o.id === r.orderId)?.poNumbers?.[0] ?? null,
        lcNumber: lc?.number ?? null,
        latestShipmentDate: lc?.latestShipmentDate ?? null,
        plannedExFactory: r.plannedExFactory,
        actualExFactory: r.actualExFactory,
        forwarder: r.forwarder,
        bookingRef: r.bookingRef,
        expNumber: r.expNumber,
        blAwb: r.blAwb,
        mode: r.mode,
        portStatus: r.portStatus as PortStatus,
        cartonCount: myCartons.length,
        // `cartons.total_qty` is an INTEGER piece count, not money — the lint
        // rule matches on the word "total" in the name. Summing garments is
        // exact; there is no decimal to lose.
        // eslint-disable-next-line fabricxai/no-float-money
        packedQty: myCartons.reduce((n, c) => n + c.totalQty, 0),
        packingList: list,
        docs,
        blockers,
        // Negative means the goods left AFTER the LC's deadline — a discrepancy
        // the buyer has to waive, not a scheduling inconvenience.
        daysAgainstLatestShipment: against,
      }
    })
  })
}

/**
 * Cartons packed against an order and not yet loaded onto any shipment.
 *
 * Lives here rather than in `actions.ts`, where it was a dynamic import of drizzle and the
 * schema inside the action body (audit BE-H1, rule 1: an action is auth → zod → service).
 * The dynamic import also put it beyond the reach of the `@/db/client` ban, which is the
 * shape of violation a lint rule cannot see coming.
 */
export async function unassignedCartons(
  ctx: AnyCtx,
  input: { orderId: string },
): Promise<{ id: string }[]> {
  return withTenantRead(ctx, (tx) =>
    tx
      .select({ id: cartons.id })
      .from(cartons)
      .where(and(eq(cartons.orderId, input.orderId), isNull(cartons.shipmentId))),
  )
}

