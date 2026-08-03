/**
 * Read models for Maintenance.
 *
 * The board is ordered by what stops production, not by what arrived first: a
 * `line_down` ticket is a whole sewing line standing idle, and a `normal` one
 * is a machine somebody can work around. Age breaks ties within a priority.
 *
 * Spare-part shortfalls are surfaced rather than hidden. When a mechanic fits
 * more than the store believed it had, the service records the shortfall and
 * floors stock at zero rather than refusing the repair — so a negative is
 * impossible, but an unexplained gap is visible.
 */
import { asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { AnyCtx } from '@/modules/core/ctx'
import { withTenantRead } from '@/modules/core/tenancy'
import { lines } from '@/modules/planning/schema'

import { machines, pmSchedules, spareParts, tickets } from './schema'

export type TicketPriority = 'line_down' | 'high' | 'normal'
export type TicketStatus = 'open' | 'claimed' | 'resolved' | 'cancelled'

/** Loudest first. The order a mechanic should walk the floor in. */
const PRIORITY_RANK: Record<TicketPriority, number> = { line_down: 0, high: 1, normal: 2 }

export interface TicketRow {
  id: string
  priority: TicketPriority
  status: TicketStatus
  source: string
  reportedAt: Date
  claimedAt: Date | null
  /** Hours since it was reported, for anything not yet resolved. */
  openHours: number | null
  /**
   * The same span in MINUTES.
   *
   * A line down 47 minutes and one down 20 both read as "0 hours", and on a maintenance
   * queue that difference is the difference between walking and running. Computed here
   * from the query's own `now` rather than at render — a clock read during render is
   * impure, and the whole board should agree on one instant anyway.
   */
  openMinutes: number | null
  lineCode: string | null
  machineType: string | null
  machineSerial: string | null
  /** Raised automatically from a recorded stoppage rather than by a person. */
  fromDowntime: boolean
  notes: string | null
}

export async function ticketBoard(
  ctx: AnyCtx,
  input: { now: Date },
): Promise<TicketRow[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: tickets.id,
        priority: tickets.priority,
        status: tickets.status,
        source: tickets.source,
        reportedAt: tickets.reportedAt,
        claimedAt: tickets.claimedAt,
        resolvedAt: tickets.resolvedAt,
        downtimeId: tickets.downtimeId,
        notes: tickets.notes,
        lineId: tickets.lineId,
        machineId: tickets.machineId,
      })
      .from(tickets)
      .where(inArray(tickets.status, ['open', 'claimed']))
      .orderBy(desc(tickets.reportedAt))
      .limit(150)

    if (rows.length === 0) return []

    const lineIds = [...new Set(rows.map((r) => r.lineId).filter((id): id is string => !!id))]
    const machineIds = [...new Set(rows.map((r) => r.machineId).filter((id): id is string => !!id))]

    const [lineRows, machineRows] = await Promise.all([
      lineIds.length > 0
        ? tx.select({ id: lines.id, code: lines.code }).from(lines).where(inArray(lines.id, lineIds))
        : Promise.resolve([] as { id: string; code: string }[]),
      machineIds.length > 0
        ? tx
            .select({
              id: machines.id,
              machineType: machines.machineType,
              serial: machines.serial,
            })
            .from(machines)
            .where(inArray(machines.id, machineIds))
        : Promise.resolve([] as { id: string; machineType: string; serial: string | null }[]),
    ])

    return rows
      .map((r): TicketRow => {
        const machine = machineRows.find((m) => m.id === r.machineId)
        return {
          id: r.id,
          priority: r.priority as TicketPriority,
          status: r.status as TicketStatus,
          source: r.source,
          reportedAt: r.reportedAt,
          claimedAt: r.claimedAt,
          openHours: Math.floor((input.now.getTime() - r.reportedAt.getTime()) / 3_600_000),
          openMinutes: Math.max(
            0,
            Math.round((input.now.getTime() - r.reportedAt.getTime()) / 60_000),
          ),
          lineCode: lineRows.find((l) => l.id === r.lineId)?.code ?? null,
          machineType: machine?.machineType ?? null,
          machineSerial: machine?.serial ?? null,
          // An auto-raised ticket has a stoppage behind it, so the downtime is
          // already recorded — a mechanic does not need to log it again.
          fromDowntime: !!r.downtimeId,
          notes: r.notes,
        }
      })
      .sort((a, b) => {
        const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        // Oldest first within a priority — the one that has been down longest.
        return byPriority !== 0 ? byPriority : (b.openHours ?? 0) - (a.openHours ?? 0)
      })
  })
}

export interface SparePartRow {
  id: string
  code: string
  name: string
  onHand: number
  minLevel: number
  /** At or below the reorder level. */
  low: boolean
  /** Nothing left at all — the next repair needing this one stops. */
  out: boolean
}

export async function spares(ctx: AnyCtx): Promise<SparePartRow[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: spareParts.id,
        code: spareParts.code,
        name: spareParts.name,
        onHand: spareParts.onHand,
        minLevel: spareParts.minLevel,
      })
      .from(spareParts)
      .orderBy(asc(spareParts.code))

    return rows.map((r) => ({
      ...r,
      low: r.onHand <= r.minLevel,
      out: r.onHand === 0,
    }))
  })
}

export interface FleetRow {
  id: string
  machineType: string
  brand: string | null
  model: string | null
  serial: string | null
  lineCode: string | null
  openTickets: number
}

export async function fleet(ctx: AnyCtx): Promise<FleetRow[]> {
  return withTenantRead(ctx, (tx) =>
    tx
      .select({
        id: machines.id,
        machineType: machines.machineType,
        brand: machines.brand,
        model: machines.model,
        serial: machines.serial,
        lineCode: lines.code,
        openTickets: sql<number>`count(${tickets.id}) filter (
          where ${tickets.status} in ('open', 'claimed')
        )`.mapWith(Number),
      })
      .from(machines)
      .leftJoin(lines, eq(lines.id, machines.lineId))
      .leftJoin(tickets, eq(tickets.machineId, machines.id))
      .groupBy(machines.id, lines.code)
      .orderBy(asc(machines.machineType)),
  )
}

/** Machines with no line assigned — real, and worth surfacing rather than hiding. */
export async function unassigned(ctx: AnyCtx): Promise<number> {
  return withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(machines)
      .where(isNull(machines.lineId))
    return row?.n ?? 0
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The registry, and what is due on it
// ─────────────────────────────────────────────────────────────────────────────

export interface MachineDetail {
  id: string
  machineType: string
  brand: string | null
  model: string | null
  serial: string | null
  purchasedAt: string | null
  lineId: string | null
  lineCode: string | null
  openTickets: number
  /** Every line this machine has sat on, oldest first. Appended, never rewritten. */
  assignmentHistory: { lineId: string; from: string | null; to: string | null }[]
}

/**
 * The registry, with each machine's assignment history.
 *
 * The history is carried because the current line alone hides the useful fact. A machine
 * that has moved between four lines this quarter is often the reason it keeps breaking —
 * or the reason nobody has serviced it, because each line assumed the last one had.
 */
export async function registry(ctx: AnyCtx): Promise<MachineDetail[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: machines.id,
        machineType: machines.machineType,
        brand: machines.brand,
        model: machines.model,
        serial: machines.serial,
        purchasedAt: machines.purchasedAt,
        lineId: machines.lineId,
        lineCode: lines.code,
        assignmentHistory: machines.assignmentHistory,
        openTickets: sql<number>`count(${tickets.id}) filter (
          where ${tickets.status} in ('open', 'claimed')
        )`.mapWith(Number),
      })
      .from(machines)
      .leftJoin(lines, eq(lines.id, machines.lineId))
      .leftJoin(tickets, eq(tickets.machineId, machines.id))
      .groupBy(machines.id, lines.code)
      .orderBy(asc(machines.machineType), asc(machines.serial))

    return rows.map((row) => ({
      ...row,
      assignmentHistory: (row.assignmentHistory ?? []) as MachineDetail['assignmentHistory'],
    }))
  })
}

/** Lines a machine can be assigned to, read through the module that owns them (rule 11). */
export async function assignableLines(
  ctx: AnyCtx,
): Promise<{ id: string; code: string; name: string | null }[]> {
  return withTenantRead(ctx, (tx) =>
    tx.select({ id: lines.id, code: lines.code, name: lines.name }).from(lines).orderBy(asc(lines.code)),
  )
}

export interface PmDueRow {
  scheduleId: string
  machineId: string
  machineType: string
  brand: string | null
  serial: string | null
  lineCode: string | null
  cadence: string
  dueOn: string
  daysOverdue: number
  neverServiced: boolean
  /** The steps the mechanic signs off, from the schedule. */
  checklist: string[]
}

/**
 * What is due, with everything needed to actually do it.
 *
 * `pmDue` in the service answers *whether* a machine is due; this adds the two things a
 * person standing in front of one needs — which machine it is on the floor, and what the
 * checklist actually says. Without the steps the screen can only offer "mark done", and a
 * PM signed off without its checks is a maintenance record of nothing.
 */
export async function pmWorklist(ctx: AnyCtx, today: string): Promise<PmDueRow[]> {
  const { pmDue } = await import('./service')
  const due = await pmDue(ctx, today)
  if (due.length === 0) return []

  return withTenantRead(ctx, async (tx) => {
    const schedules = await tx
      .select({ id: pmSchedules.id, cadence: pmSchedules.cadence, checklist: pmSchedules.checklist })
      .from(pmSchedules)
      .where(inArray(pmSchedules.id, [...new Set(due.map((d) => d.scheduleId))]))

    const detail = await tx
      .select({
        id: machines.id,
        machineType: machines.machineType,
        brand: machines.brand,
        serial: machines.serial,
        lineCode: lines.code,
      })
      .from(machines)
      .leftJoin(lines, eq(lines.id, machines.lineId))
      .where(inArray(machines.id, [...new Set(due.map((d) => d.machineId))]))

    const scheduleById = new Map(schedules.map((s) => [s.id, s]))
    const machineById = new Map(detail.map((m) => [m.id, m]))

    return due.flatMap((entry) => {
      const schedule = scheduleById.get(entry.scheduleId)
      const machine = machineById.get(entry.machineId)
      // Both sides were read from the same rows a moment ago; a gap means the machine was
      // deleted mid-read. Dropping it beats rendering a checklist for nothing.
      if (!schedule || !machine) return []

      return [
        {
          scheduleId: entry.scheduleId,
          machineId: entry.machineId,
          machineType: machine.machineType,
          brand: machine.brand,
          serial: machine.serial,
          lineCode: machine.lineCode,
          cadence: schedule.cadence,
          dueOn: entry.dueOn,
          daysOverdue: entry.daysOverdue,
          neverServiced: entry.neverServiced,
          // Stored as unknown[]; only the strings are steps a person can tick.
          checklist: (schedule.checklist ?? []).filter(
            (step): step is string => typeof step === 'string',
          ),
        },
      ]
    })
  })
}
