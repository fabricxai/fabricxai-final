/**
 * MARBIM tools for 9.1 Maintenance.
 *
 * A stopped machine is a stopped line, and the question "why does this line keep going
 * down" has an answer sitting in the breakdown history that nobody could reach.
 *
 * **Read-only, and `pendingTargets` is empty for the reason it should be.** Everything this
 * module writes is somebody at a machine: a ticket raised because it stopped, a claim, a
 * repair, a PM signed off check by check. A proposed repair is a claim that work was done.
 *
 * **A PM due today with no checks written cannot be signed off at all**, and the worklist
 * says so rather than showing an actionable row that refuses on the click.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { pmWorklist, registry, spares, ticketBoard } from './queries'
import { breakdownReport, lowStock, machineUtilization, type MaintenancePolicy } from './service'

async function policyFor(ctx: AnyCtx): Promise<MaintenancePolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<MaintenancePolicy>(ctx, 'maintenance')
}

const noArgs = z.object({}).passthrough()
const todayInput = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
})
const windowInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const utilisationInput = z.object({
  machineId: z.string().uuid(),
  availableMinutes: z.number().int().positive(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const tickets: ReadTool = {
  kind: 'read',
  name: 'maintenance.ticket_board',
  description:
    'Open maintenance tickets, loudest first. `line_down` means a whole sewing line is idle ' +
    'and is never a priority somebody chose — it comes from an automatic ticket raised by a ' +
    'production stoppage. Answer with the walking order, not the arrival order.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => ticketBoard(ctx, { now: new Date() }),
}

const fleet: ReadTool = {
  kind: 'read',
  name: 'maintenance.machine_registry',
  description:
    'Every machine with its type, serial, current line, open tickets and where it has been ' +
    'assigned before. A machine that has moved between lines repeatedly is often the one ' +
    'nobody has serviced — each line assuming the last one had.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => registry(ctx),
}

const pm: ReadTool = {
  kind: 'read',
  name: 'maintenance.pm_due',
  description:
    'Preventive maintenance due, with the checks each visit requires. A machine with NO ' +
    'service on record is due immediately and says so — that is the honest reading of "we ' +
    'have never serviced this", not a scheduling error. A schedule with no checks written ' +
    'cannot be signed off at all.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return pmWorklist(ctx, today)
  },
}

const parts: ReadTool = {
  kind: 'read',
  name: 'maintenance.low_stock_spares',
  description:
    'Spare parts at or below their reorder point, with how many are left. A looper the floor ' +
    'burns through weekly is a different kind of low from one it uses twice a year.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => lowStock(ctx),
}

const breakdowns: ReadTool = {
  kind: 'read',
  name: 'maintenance.breakdown_report',
  description:
    'Breakdowns over a window with their downtime, grouped so a repeating machine or fault ' +
    'is visible. The outlier is the point — one long stoppage and ten short ones on the same ' +
    'machine are different problems.',
  input: windowInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { from, to } = windowInput.parse(args)
    return breakdownReport(ctx, { from: new Date(from), to: new Date(to) }, await policyFor(ctx))
  },
}

const utilisation: ReadTool = {
  kind: 'read',
  name: 'maintenance.machine_utilization',
  description:
    'Downtime minutes and utilisation for ONE machine over a window, against the minutes it ' +
    'was available. Available minutes are supplied because only the caller knows the shift ' +
    'pattern that applied — a percentage against an assumed working day would be a different ' +
    'number every time somebody changed shift.',
  input: utilisationInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = utilisationInput.parse(args)
    return machineUtilization(ctx, {
      machineId: input.machineId,
      availableMinutes: input.availableMinutes,
      from: new Date(input.from),
      to: new Date(input.to),
    })
  },
}

const sparesList: ReadTool = {
  kind: 'read',
  name: 'maintenance.spares',
  description: 'The spare parts store: code, name, quantity on hand and reorder point.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => spares(ctx),
}

export const maintenanceToolPack: ToolPack = {
  moduleId: 'maintenance',
  tools: [tickets, fleet, pm, parts, breakdowns, utilisation, sparesList],
}
