/**
 * 9.1 integration.
 *
 * The pure rules are in `maintenance.test.ts`. What is asserted here is what the module does
 * when the floor and the data disagree:
 *
 *  - one stoppage raises exactly one ticket, however many times the event is redelivered;
 *  - two mechanics claiming the same line-down ticket — the normal case — and the second
 *    getting a typed 409 rather than overwriting the first;
 *  - a resolution is NOT blocked by a stale spare-parts count, but the shortfall is recorded
 *    and stock never goes negative;
 *  - `resolved` is terminal, so a machine that breaks again is a second breakdown;
 *  - a PM checklist cannot be signed off against the wrong kind of machine;
 *  - a downtime cost stores the rate it was computed at;
 *  - cross-company reads and writes see nothing.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { money } from '@/lib/money'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, users } from '@/db/schema/core'
import type { RequestCtx } from '@/modules/core/ctx'
import {
  breakdownReport,
  claimTicket,
  compileMonthlyDowntimeCosts,
  completePm,
  lowStock,
  machineUtilization,
  openTicket,
  openTicketFromDowntime,
  openTickets,
  pmDue,
  registerMachine,
  resolveTicket,
  ticketById,
  type MaintenancePolicy,
} from '@/modules/maintenance/service'
import '@/modules/maintenance/register'
import {
  downtimeCosts,
  machines,
  pmCompletions,
  pmSchedules,
  spareParts,
  tickets,
} from '@/modules/maintenance/schema'
import { lines } from '@/modules/planning/schema'
import { downtimes } from '@/modules/production/schema'

const client = createDirectClient()
const db = createDirectDb(client)

const COMPANY = randomUUID()
const OTHER = randomUUID()
const USER = `mnt-${randomUUID().slice(0, 8)}`
const MECHANIC = `mch-${randomUUID().slice(0, 8)}`
const ctx: RequestCtx = { companyId: COMPANY, userId: USER, roles: ['maintenance'] }
const mechanicCtx: RequestCtx = { companyId: COMPANY, userId: MECHANIC, roles: ['maintenance'] }
const otherCtx: RequestCtx = { companyId: OTHER, userId: USER, roles: ['maintenance'] }

const POLICY: MaintenancePolicy = {
  lineValuePerMinute: money('12.50', 'BDT'),
  minFleetTickets: 10,
  outlierMultiple: 3,
  outlierMinTickets: 5,
}

let lineId: string
let otherLineId: string
let machineId: string

beforeAll(async () => {
  await db.insert(companies).values([
    { id: COMPANY, name: 'Maint Co', slug: `mnt-${COMPANY.slice(0, 8)}` },
    { id: OTHER, name: 'Other Co', slug: `oth-${OTHER.slice(0, 8)}` },
  ])
  await db.insert(users).values([
    { id: USER, email: `${USER}@fabricxai.test`, name: 'Maint' },
    { id: MECHANIC, email: `${MECHANIC}@fabricxai.test`, name: 'Mechanic' },
  ])

  const [line] = await db
    .insert(lines)
    .values({ companyId: COMPANY, code: 'L1', name: 'Line 1', capacityManpower: 40 })
    .returning({ id: lines.id })
  lineId = line!.id

  const [foreign] = await db
    .insert(lines)
    .values({ companyId: OTHER, code: 'L1', name: 'Other Line 1', capacityManpower: 40 })
    .returning({ id: lines.id })
  otherLineId = foreign!.id
})

afterAll(async () => {
  await db.execute(sql`delete from audit_log where company_id in (${COMPANY}, ${OTHER})`)
  await db.delete(companies).where(eq(companies.id, COMPANY))
  await db.delete(companies).where(eq(companies.id, OTHER))
  await db.delete(users).where(eq(users.id, USER))
  await db.delete(users).where(eq(users.id, MECHANIC))
  await client.end()
})

beforeEach(async () => {
  await db.delete(tickets).where(eq(tickets.companyId, COMPANY))
  await db.delete(downtimeCosts).where(eq(downtimeCosts.companyId, COMPANY))
  await db.delete(pmCompletions).where(eq(pmCompletions.companyId, COMPANY))
  await db.delete(pmSchedules).where(eq(pmSchedules.companyId, COMPANY))
  await db.delete(spareParts).where(eq(spareParts.companyId, COMPANY))
  await db.delete(downtimes).where(eq(downtimes.companyId, COMPANY))
  await db.delete(machines).where(eq(machines.companyId, COMPANY))

  const registered = await registerMachine(ctx, {
    machineType: 'overlock',
    brand: 'Juki',
    serial: `SN-${randomUUID().slice(0, 8)}`,
    lineId,
  })
  machineId = registered.machineId
})

const newDowntimeId = () => randomUUID()

describe('9.1 · a stoppage raises a ticket', () => {
  it('opens one at line_down priority and links back to the stoppage', async () => {
    const downtimeId = newDowntimeId()
    const opened = await openTicketFromDowntime(ctx, {
      downtimeId,
      lineId,
      machineId,
      startedAt: '2026-03-01T04:00:00Z',
    })

    expect(opened.created).toBe(true)

    const ticket = await ticketById(ctx, opened.ticketId)
    // Not a judgement anybody makes: the event only fires for a machine stoppage, and a
    // machine stoppage means the line is not sewing.
    expect(ticket!.priority).toBe('line_down')
    expect(ticket!.source).toBe('downtime_auto')
    expect(ticket!.downtimeId).toBe(downtimeId)
  })

  it('a redelivered event does NOT become a second breakdown', async () => {
    const downtimeId = newDowntimeId()
    const first = await openTicketFromDowntime(ctx, {
      downtimeId,
      lineId,
      machineId,
      startedAt: '2026-03-01T04:00:00Z',
    })
    const again = await openTicketFromDowntime(ctx, {
      downtimeId,
      lineId,
      machineId,
      startedAt: '2026-03-01T04:00:00Z',
    })

    expect(again.created).toBe(false)
    expect(again.ticketId).toBe(first.ticketId)
    // Three tickets from one stoppage would read as three breakdowns in the outlier report.
    expect(await db.select().from(tickets).where(eq(tickets.companyId, COMPANY))).toHaveLength(1)
  })

  it('refuses another company’s line', async () => {
    // Postgres runs FK checks with RLS bypassed, so the foreign key alone would take it.
    await expect(
      openTicketFromDowntime(ctx, {
        downtimeId: newDowntimeId(),
        lineId: otherLineId,
        startedAt: '2026-03-01T04:00:00Z',
      }),
    ).rejects.toMatchObject({ messageKey: 'maintenance.errors.line_not_found' })
  })

  it('a manual ticket cannot claim line_down', async () => {
    // That priority means a line is not sewing right now, and it is the automatic tickets'
    // to hold — a manual one claiming it jumps the queue they exist to order.
    await expect(
      openTicket(ctx, { machineId, priority: 'line_down' as never, notes: 'rattling' }),
    ).rejects.toThrow()
  })
})

describe('9.1 · the ticket lifecycle', () => {
  it('the second mechanic to claim gets a typed 409', async () => {
    const opened = await openTicketFromDowntime(ctx, {
      downtimeId: newDowntimeId(),
      lineId,
      machineId,
      startedAt: '2026-03-01T04:00:00Z',
    })

    await claimTicket(ctx, { ticketId: opened.ticketId })

    // Two mechanics tapping claim on the same line-down ticket is the normal case.
    await expect(
      claimTicket(mechanicCtx, { ticketId: opened.ticketId }),
    ).rejects.toMatchObject({ status: 409 })

    const ticket = await ticketById(ctx, opened.ticketId)
    expect(ticket!.claimedBy).toBe(USER)
  })

  it('cannot resolve a ticket nobody claimed', async () => {
    const opened = await openTicket(ctx, { machineId, priority: 'normal' })
    await expect(
      resolveTicket(ctx, { ticketId: opened.ticketId, partsUsed: [] }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('resolved is TERMINAL — a machine that breaks again is a new breakdown', async () => {
    const opened = await openTicket(ctx, { machineId, priority: 'normal' })
    await claimTicket(ctx, { ticketId: opened.ticketId })
    await resolveTicket(ctx, { ticketId: opened.ticketId, partsUsed: [] })

    // Reopening would hide a machine failing weekly behind one long-running ticket.
    await expect(claimTicket(ctx, { ticketId: opened.ticketId })).rejects.toMatchObject({
      status: 409,
    })
  })

  it('the board lists open work with line_down first', async () => {
    await openTicket(ctx, { machineId, priority: 'normal', notes: 'rattling' })
    const urgent = await openTicketFromDowntime(ctx, {
      downtimeId: newDowntimeId(),
      lineId,
      machineId,
      startedAt: '2026-03-01T04:00:00Z',
    })

    const board = await openTickets(ctx)
    expect(board[0]!.id).toBe(urgent.ticketId)
  })
})

describe('9.1 · spare parts', () => {
  let partId: string

  beforeEach(async () => {
    const [part] = await db
      .insert(spareParts)
      .values({ companyId: COMPANY, code: 'LOOPER', name: 'Looper', onHand: 3, minLevel: 5 })
      .returning({ id: spareParts.id })
    partId = part!.id
  })

  it('takes the parts off the shelf when a ticket resolves', async () => {
    const opened = await openTicket(ctx, { machineId, priority: 'normal' })
    await claimTicket(ctx, { ticketId: opened.ticketId })
    await resolveTicket(ctx, { ticketId: opened.ticketId, partsUsed: [{ partId, qty: 2 }] })

    const [part] = await db.select().from(spareParts).where(eq(spareParts.id, partId))
    expect(part!.onHand).toBe(1)
  })

  it('does NOT block a resolution on a stale count, and records the shortfall', async () => {
    const opened = await openTicket(ctx, { machineId, priority: 'normal' })
    await claimTicket(ctx, { ticketId: opened.ticketId })

    // The mechanic fitted five; the store believed it had three. The work happened.
    const resolved = await resolveTicket(ctx, {
      ticketId: opened.ticketId,
      partsUsed: [{ partId, qty: 5 }],
    })

    expect(resolved.status).toBe('resolved')
    expect(resolved.shortfalls).toHaveLength(1)
    expect(resolved.shortfalls[0]).toMatchObject({ used: 5, onHand: 3, shortfall: 2 })

    const [part] = await db.select().from(spareParts).where(eq(spareParts.id, partId))
    // Floored at zero. A negative count would silently corrupt every reorder list after it.
    expect(part!.onHand).toBe(0)

    const ticket = await ticketById(ctx, opened.ticketId)
    expect((ticket!.partsUsed as { shortfall: number }[])[0]!.shortfall).toBe(2)
  })

  it('lists what needs ordering, at the minimum as well as below it', async () => {
    const low = await lowStock(ctx)
    // 3 on hand against a minimum of 5.
    expect(low.map((p) => p.name)).toContain('Looper')
    expect(low[0]!.shortfall).toBe(2)
  })

  it('another company sees none of these parts', async () => {
    expect(await lowStock(otherCtx)).toEqual([])
  })
})

describe('9.1 · preventive maintenance', () => {
  let scheduleId: string

  beforeEach(async () => {
    const [schedule] = await db
      .insert(pmSchedules)
      .values({
        companyId: COMPANY,
        machineType: 'overlock',
        cadence: 'monthly',
        checklist: [{ step: 'Clean lint from hook area' }, { step: 'Check needle bar timing' }],
      })
      .returning({ id: pmSchedules.id })
    scheduleId = schedule!.id
  })

  it('a machine with no PM history is due TODAY', async () => {
    const due = await pmDue(ctx, '2026-03-10')
    const mine = due.find((d) => d.machineId === machineId)!

    // Counting a month forward from nothing would hand it grace it never earned — and the
    // machines with no PM record are usually the ones nobody is looking after.
    expect(mine.neverServiced).toBe(true)
    expect(mine.dueOn).toBe('2026-03-10')
    expect(mine.daysOverdue).toBe(0)
  })

  it('drops off the list once serviced, and comes back a month later', async () => {
    await completePm(ctx, {
      scheduleId,
      machineId,
      completedOn: '2026-03-10',
      checked: [{ step: 'Clean lint from hook area', ok: true }],
    })

    expect((await pmDue(ctx, '2026-03-11')).map((d) => d.machineId)).not.toContain(machineId)
    expect((await pmDue(ctx, '2026-04-10')).map((d) => d.machineId)).toContain(machineId)
  })

  it('a double-tap on the handset is not a second service', async () => {
    const first = await completePm(ctx, {
      scheduleId,
      machineId,
      completedOn: '2026-03-10',
      checked: [{ step: 'Clean lint from hook area', ok: true }],
    })
    const again = await completePm(ctx, {
      scheduleId,
      machineId,
      completedOn: '2026-03-10',
      checked: [{ step: 'Clean lint from hook area', ok: true }],
    })

    expect(again.alreadyRecorded).toBe(true)
    expect(again.completionId).toBe(first.completionId)
  })

  it('REFUSES a checklist signed off against the wrong kind of machine', async () => {
    const other = await registerMachine(ctx, { machineType: 'buttonhole', lineId })

    // A service recorded on a machine it was not for leaves that machine looking maintained.
    await expect(
      completePm(ctx, {
        scheduleId,
        machineId: other.machineId,
        completedOn: '2026-03-10',
        checked: [{ step: 'Clean lint from hook area', ok: true }],
      }),
    ).rejects.toMatchObject({ messageKey: 'maintenance.errors.schedule_type_mismatch' })
  })

  it('another company’s due-list is empty', async () => {
    expect(await pmDue(otherCtx, '2026-03-10')).toEqual([])
  })
})

describe('9.1 · what stoppages cost', () => {
  const openStoppage = async (from: string, to: string | null) => {
    await db.insert(downtimes).values({
      companyId: COMPANY,
      lineId,
      machineId,
      reason: 'machine',
      startedAt: new Date(from),
      endedAt: to ? new Date(to) : null,
      createdBy: USER,
    })
  }

  it('stores the rate it was computed at, beside the figure', async () => {
    await openStoppage('2026-03-02T04:00:00Z', '2026-03-02T08:00:00Z')

    await compileMonthlyDowntimeCosts(ctx, { forMonth: '2026-03-01' }, POLICY)

    const [row] = await db.select().from(downtimeCosts).where(eq(downtimeCosts.machineId, machineId))
    expect(row!.minutes).toBe(240)
    expect(row!.estimatedLoss).toBe('3000.00')
    // The value of a line-minute moves with wages and with what the line is running. A loss
    // stored without its rate cannot be reproduced or argued with six months later.
    expect(row!.valuePerMinute).toBe('12.50')
    expect(row!.currency).toBe('BDT')
  })

  it('a machine that is STILL DOWN gets no cost row, not a row claiming zero', async () => {
    // Its only stoppage has no duration yet. A stored row of 0 minutes and 0.00 BDT reads
    // as "this machine cost nothing this month", which is the opposite of what is true —
    // it is the machine currently stopping a line.
    await openStoppage('2026-03-03T04:00:00Z', null)

    await compileMonthlyDowntimeCosts(ctx, { forMonth: '2026-03-01' }, POLICY)

    expect(
      await db.select().from(downtimeCosts).where(eq(downtimeCosts.machineId, machineId)),
    ).toHaveLength(0)
  })

  it('counts only the closed part of a month, so the figure does not move between runs', async () => {
    await openStoppage('2026-03-02T04:00:00Z', '2026-03-02T08:00:00Z')
    await openStoppage('2026-03-03T04:00:00Z', null)

    await compileMonthlyDowntimeCosts(ctx, { forMonth: '2026-03-01' }, POLICY)

    const [row] = await db.select().from(downtimeCosts).where(eq(downtimeCosts.machineId, machineId))
    expect(row!.minutes).toBe(240)
  })

  it('recompiling the same month replaces the figure rather than doubling it', async () => {
    await openStoppage('2026-03-02T04:00:00Z', '2026-03-02T08:00:00Z')

    await compileMonthlyDowntimeCosts(ctx, { forMonth: '2026-03-01' }, POLICY)
    await compileMonthlyDowntimeCosts(ctx, { forMonth: '2026-03-01' }, POLICY)

    const rows = await db.select().from(downtimeCosts).where(eq(downtimeCosts.machineId, machineId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.minutes).toBe(240)
  })

  it('REFUSES to price a month with no configured rate', async () => {
    await openStoppage('2026-03-02T04:00:00Z', '2026-03-02T08:00:00Z')

    // "0 BDT lost" against four hours of a stopped line reads as an answer and closes the
    // question. No figure is the honest output.
    await expect(
      compileMonthlyDowntimeCosts(
        ctx,
        { forMonth: '2026-03-01' },
        { ...POLICY, lineValuePerMinute: money('0', 'BDT') },
      ),
    ).rejects.toMatchObject({ messageKey: 'maintenance.errors.invalid' })

    expect(await db.select().from(downtimeCosts).where(eq(downtimeCosts.companyId, COMPANY))).toHaveLength(0)
  })

  it('reports utilization against the line’s open minutes', async () => {
    await openStoppage('2026-03-02T04:00:00Z', '2026-03-02T05:36:00Z')

    const stats = await machineUtilization(ctx, {
      machineId,
      availableMinutes: 480,
      from: new Date('2026-03-02T00:00:00Z'),
      to: new Date('2026-03-03T00:00:00Z'),
    })

    expect(stats.downMinutes).toBe(96)
    expect(stats.utilizationPct).toBe('80.00')
  })
})

describe('9.1 · the breakdown outlier report', () => {
  const WINDOW = { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-03-31T00:00:00Z') }

  const breakDown = async (id: string, times: number) => {
    for (let i = 0; i < times; i += 1) {
      await db.insert(tickets).values({
        companyId: COMPANY,
        machineId: id,
        source: 'manual',
        priority: 'normal',
        status: 'resolved',
        reportedAt: new Date('2026-03-10T04:00:00Z'),
        resolvedAt: new Date('2026-03-10T05:00:00Z'),
        createdBy: USER,
      })
    }
  }

  it('names a machine breaking down far more than the typical one', async () => {
    const others = await Promise.all([
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
    ])

    await breakDown(machineId, 18)
    for (const other of others) await breakDown(other.machineId, 3)

    const outliers = await breakdownReport(ctx, WINDOW, POLICY)
    expect(outliers.map((o) => o.machineId)).toEqual([machineId])
    expect(outliers[0]!.timesMedian).toBe('6.0')
  })

  it('counts the machines that DIDN’T break down — they are what makes a median mean anything', async () => {
    // A good fleet with two bad machines in it. Comparing the bad ones only against each
    // other makes them look normal, which is precisely when this report should speak up.
    const quiet = await Promise.all([
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
    ])
    expect(quiet).toHaveLength(3)

    const bad = await registerMachine(ctx, { machineType: 'overlock', lineId })
    await breakDown(machineId, 11)
    await breakDown(bad.machineId, 6)

    const outliers = await breakdownReport(ctx, WINDOW, POLICY)
    expect(outliers.map((o) => o.machineId)).toEqual([machineId, bad.machineId])
    // The typical machine broke down zero times, so a ratio would be undefined — the
    // absolute floor is what flagged these, and the report says so rather than printing ∞.
    expect(outliers[0]!.fleetMedian).toBe(0)
    expect(outliers[0]!.timesMedian).toBeNull()
  })

  it('stays silent when the window is too thin to mean anything', async () => {
    await Promise.all([
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
    ])
    await breakDown(machineId, 2)

    // Two tickets across a fleet is not a pattern, and this report sends a mechanic to
    // strip a machine.
    expect(await breakdownReport(ctx, WINDOW, POLICY)).toEqual([])
  })

  it('does not count cancelled tickets as breakdowns', async () => {
    const others = await Promise.all([
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
      registerMachine(ctx, { machineType: 'overlock', lineId }),
    ])
    for (const other of others) await breakDown(other.machineId, 3)

    // Eighteen tickets that all turned out not to be breakdowns.
    for (let i = 0; i < 18; i += 1) {
      await db.insert(tickets).values({
        companyId: COMPANY,
        machineId,
        source: 'manual',
        priority: 'normal',
        status: 'cancelled',
        reportedAt: new Date('2026-03-10T04:00:00Z'),
        createdBy: USER,
      })
    }

    expect(await breakdownReport(ctx, WINDOW, POLICY)).toEqual([])
  })

  it('another company’s tickets are invisible to it', async () => {
    await breakDown(machineId, 18)
    expect(await breakdownReport(otherCtx, WINDOW, POLICY)).toEqual([])
  })
})
