/**
 * 4.1 Planning seed slice — the factory's physical shape.
 *
 * Unit → floor → line. Seeded ahead of its own screens because **production has nowhere to
 * happen without it**: `lines` belongs to planning (rule 11, one writer per shared table),
 * and hourly output, downtime and endline counts all hang off a line id. A production slice
 * that invented its own lines would create rows planning would then disagree with.
 *
 * Six sewing lines is a small real factory — enough that the board has something to compare
 * across, few enough that a demo fits on one screen.
 */
import { eq } from 'drizzle-orm'

import { factoryUnits, floors, lines } from '@/modules/planning/schema'

import type { SeedContext, SeedSlice } from './types'

const UNIT = { code: 'U1', name: 'Unit 1 · Savar' }
const FLOORS = [
  { code: 'F2', name: 'Second floor · sewing' },
  { code: 'F3', name: 'Third floor · sewing' },
] as const

/** Manpower and machine counts a supervisor would recognise on a woven shirt floor. */
const LINES = [
  { code: 'L1', name: 'Line 1', floor: 'F2', manpower: 42, machines: 38 },
  { code: 'L2', name: 'Line 2', floor: 'F2', manpower: 42, machines: 38 },
  { code: 'L3', name: 'Line 3', floor: 'F2', manpower: 40, machines: 36 },
  { code: 'L4', name: 'Line 4', floor: 'F3', manpower: 44, machines: 40 },
  { code: 'L5', name: 'Line 5', floor: 'F3', manpower: 40, machines: 36 },
  { code: 'L6', name: 'Line 6', floor: 'F3', manpower: 38, machines: 34 },
] as const

export const PLANNING_SLICE: SeedSlice = {
  id: 'planning',

  async run(ctx: SeedContext): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}

    await ctx.db
      .insert(factoryUnits)
      .values({ companyId: ctx.companyId, code: UNIT.code, name: UNIT.name })
      .onConflictDoNothing()

    const [unit] = await ctx.db
      .select({ id: factoryUnits.id })
      .from(factoryUnits)
      .where(eq(factoryUnits.companyId, ctx.companyId))
      .limit(1)
    if (!unit) return counts
    counts.factory_units = 1

    for (const floor of FLOORS) {
      await ctx.db
        .insert(floors)
        .values({
          companyId: ctx.companyId,
          factoryUnitId: unit.id,
          code: floor.code,
          name: floor.name,
        })
        .onConflictDoNothing()
    }
    counts.floors = FLOORS.length

    const floorByCode = new Map(
      (
        await ctx.db
          .select({ id: floors.id, code: floors.code })
          .from(floors)
          .where(eq(floors.companyId, ctx.companyId))
      ).map((f) => [f.code, f.id]),
    )

    for (const line of LINES) {
      await ctx.db
        .insert(lines)
        .values({
          companyId: ctx.companyId,
          code: line.code,
          name: line.name,
          capacityManpower: line.manpower,
          machinesCount: line.machines,
          floorId: floorByCode.get(line.floor) ?? null,
        })
        .onConflictDoNothing()
    }
    counts.lines = LINES.length

    return counts
  },
}
