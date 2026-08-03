/**
 * 9.1 Maintenance seed slice.
 *
 * A sewing floor is a room full of machines, and the maintenance screens only mean anything
 * when the queue has the shapes a mechanic actually walks into:
 *
 *  - **One ticket is `line_down` and unclaimed.** That is a line not running right now, and
 *    it is the reason the queue is sorted the way it is. A queue of tidy `normal` tickets
 *    shows none of that.
 *  - **One is claimed and open.** Somebody is at the machine; the point of claiming is that
 *    a second mechanic does not walk to the same one.
 *  - **One is already resolved.** So the board shows what closing looks like, and the
 *    downtime minutes it wrote back exist.
 *
 * Spare parts are seeded near their reorder points, because a parts list where everything
 * is comfortably in stock never exercises the low-stock read at all.
 */
import { and, eq } from 'drizzle-orm'

import { roles } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import { machines, spareParts, tickets } from '@/modules/maintenance/schema'
import { registerMachine, upsertPmSchedule } from '@/modules/maintenance/service'
import { lines } from '@/modules/planning/schema'

import type { SeedContext, SeedSlice } from './types'

/** The machine mix on a woven shirt floor, six lines' worth. */
const MACHINE_TYPES = [
  { machineType: 'Single needle lockstitch', brand: 'Juki', model: 'DDL-8700', perLine: 4 },
  { machineType: '4-thread overlock', brand: 'Juki', model: 'MO-6716S', perLine: 2 },
  { machineType: 'Bartack', brand: 'Brother', model: 'KE-430HX', perLine: 1 },
  { machineType: 'Buttonhole', brand: 'Juki', model: 'LBH-1790', perLine: 1 },
] as const

/**
 * What preventive maintenance actually means on this floor.
 *
 * Seeded because without a schedule the whole PM feature is inert: `pmDue` returns an empty
 * list, and a factory with forty-eight machines is told "nothing is due" every day. The
 * checks are the ordinary ones a sewing-machine mechanic does, in the words they use.
 *
 * No completions are seeded with them, deliberately. Every machine therefore comes back as
 * never serviced and due today, which is the true state of a fleet nobody has recorded a
 * service against — and the state the screen most needs to render correctly.
 */
const PM_SCHEDULES = [
  {
    machineType: 'Single needle lockstitch',
    cadence: 'weekly' as const,
    checklist: [
      'Clean the hook race and oil it',
      'Check needle bar play',
      'Inspect the belt for wear and tension',
      'Test the thread trimmer',
      'Check the oil level in the reservoir',
    ],
  },
  {
    machineType: '4-thread overlock',
    cadence: 'weekly' as const,
    checklist: [
      'Blow out lint from the looper area',
      'Check looper timing',
      'Inspect the knife edge and replace if chipped',
      'Check differential feed adjustment',
      'Oil and check for leaks',
    ],
  },
  {
    machineType: 'Bartack',
    cadence: 'monthly' as const,
    checklist: [
      'Clean and oil the shuttle',
      'Verify the stitch pattern against the sample card',
      'Check the clamp foot lift height',
      'Inspect the drive belt',
    ],
  },
  {
    machineType: 'Buttonhole',
    cadence: 'monthly' as const,
    checklist: [
      'Clean the cutting knife and check the edge',
      'Verify buttonhole length against the spec card',
      'Oil the feed mechanism',
      'Check the thread tension discs for grooving',
    ],
  },
] as const

/** Parts a sewing floor burns through, seeded near their reorder points. */
const SPARES = [
  { code: 'NDL-DBX1-14', name: 'Needle DBx1 #14', onHand: 180, minLevel: 200 },
  { code: 'BOB-STD', name: 'Bobbin, standard', onHand: 340, minLevel: 150 },
  { code: 'LOOP-MO67', name: 'Looper, MO-6716S', onHand: 3, minLevel: 6 },
  { code: 'BELT-V-M35', name: 'V-belt M35', onHand: 11, minLevel: 8 },
  { code: 'FEED-DOG-8700', name: 'Feed dog, DDL-8700', onHand: 5, minLevel: 10 },
] as const

/**
 * The queue. `reportedAt` is minutes back so the clock on each ticket reads like a real one.
 *
 * `line_down` is only ever set by an automatic ticket raised from a production stoppage —
 * a person cannot choose it — so the seed sets it directly rather than through `openTicket`,
 * which would refuse the priority for exactly that reason.
 */
const TICKETS = [
  { priority: 'line_down' as const, status: 'open' as const, minutesAgo: 47, notes: 'Needle bar seized on the 4-thread overlock; line stopped.' },
  { priority: 'high' as const, status: 'claimed' as const, minutesAgo: 156, notes: 'Bartack skipping every third cycle.' },
  { priority: 'normal' as const, status: 'open' as const, minutesAgo: 320, notes: 'Buttonhole cutter blunt — cuts fraying at the edge.' },
  { priority: 'normal' as const, status: 'resolved' as const, minutesAgo: 1490, notes: 'Feed dog replaced; stitch length holding.' },
] as const

export const MAINTENANCE_SLICE: SeedSlice = {
  id: 'maintenance',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}

    const [owner] = await ctx.db
      .select({ userId: roles.userId })
      .from(roles)
      .where(and(eq(roles.companyId, ctx.companyId), eq(roles.role, 'owner')))
    if (!owner) return counts

    const requestCtx: RequestCtx = {
      companyId: ctx.companyId,
      userId: owner.userId,
      roles: ['maintenance'],
    }

    const lineRows = await ctx.db
      .select({ id: lines.id, code: lines.code })
      .from(lines)
      .where(eq(lines.companyId, ctx.companyId))
      .orderBy(lines.code)
    if (lineRows.length === 0) return counts

    // ── The fleet ───────────────────────────────────────────────────────────
    const [anyMachine] = await ctx.db
      .select({ id: machines.id })
      .from(machines)
      .where(eq(machines.companyId, ctx.companyId))

    let registered = 0
    if (!anyMachine) {
      for (const line of lineRows) {
        for (const spec of MACHINE_TYPES) {
          for (let n = 0; n < spec.perLine; n += 1) {
            await registerMachine(requestCtx, {
              machineType: spec.machineType,
              brand: spec.brand,
              model: spec.model,
              serial: `${spec.model}-${line.code}-${String(n + 1).padStart(2, '0')}`,
              lineId: line.id,
              assignedFrom: '2025-09-01',
            })
            registered += 1
          }
        }
      }
    }
    counts.machines = registered

    // ── Preventive maintenance ──────────────────────────────────────────────
    // Idempotent by (type, cadence): `upsertPmSchedule` replaces the checklist rather than
    // adding a second schedule, so re-running the seed is safe.
    let scheduled = 0
    for (const schedule of PM_SCHEDULES) {
      await upsertPmSchedule(requestCtx, {
        machineType: schedule.machineType,
        cadence: schedule.cadence,
        checklist: [...schedule.checklist],
      })
      scheduled += 1
    }
    counts.pm_schedules = scheduled

    // ── Spares ──────────────────────────────────────────────────────────────
    let parts = 0
    for (const spec of SPARES) {
      const [existing] = await ctx.db
        .select({ id: spareParts.id })
        .from(spareParts)
        .where(and(eq(spareParts.companyId, ctx.companyId), eq(spareParts.code, spec.code)))
      if (existing) continue

      await ctx.db.insert(spareParts).values({
        companyId: ctx.companyId,
        code: spec.code,
        name: spec.name,
        onHand: spec.onHand,
        minLevel: spec.minLevel,
        createdBy: owner.userId,
      })
      parts += 1
    }
    counts.spare_parts = parts

    // ── The queue ───────────────────────────────────────────────────────────
    const [anyTicket] = await ctx.db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.companyId, ctx.companyId))
    if (anyTicket) return counts

    const fleet = await ctx.db
      .select({ id: machines.id, lineId: machines.lineId })
      .from(machines)
      .where(eq(machines.companyId, ctx.companyId))

    let raised = 0
    for (const [index, spec] of TICKETS.entries()) {
      const machine = fleet[index * 7 % Math.max(1, fleet.length)]
      if (!machine) continue

      const reportedAt = new Date(Date.now() - spec.minutesAgo * 60_000)

      await ctx.db.insert(tickets).values({
        companyId: ctx.companyId,
        machineId: machine.id,
        lineId: machine.lineId,
        // `line_down` only ever comes from a stoppage the floor logged, never a person.
        source: spec.priority === 'line_down' ? 'downtime_auto' : 'manual',
        priority: spec.priority,
        status: spec.status,
        reportedAt,
        notes: spec.notes,
        ...(spec.status === 'claimed' || spec.status === 'resolved'
          ? { claimedBy: owner.userId, claimedAt: new Date(reportedAt.getTime() + 9 * 60_000) }
          : {}),
        ...(spec.status === 'resolved'
          ? { resolvedAt: new Date(reportedAt.getTime() + 74 * 60_000) }
          : {}),
      })
      raised += 1
    }
    counts.tickets = raised

    return counts
  },
}
