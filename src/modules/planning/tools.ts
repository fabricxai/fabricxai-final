/**
 * MARBIM tools for 4.1 Planning Board.
 *
 * "Can we take it, and when would it finish?" is the question, and answering it needs the
 * style's SMV, the lines' manpower and the learning curve for that product — none of which
 * a model should attempt in prose. `planning.capacity_query` runs the real arithmetic and
 * refuses outright when a style has no SMV on record, which is the correct answer: planning
 * a style with an invented SMV is how a factory commits to a date it cannot make.
 *
 * **Read-only.** Allocations are the factory promising its capacity, and a scenario is
 * applied through `commitScenarioApply` after somebody compares it. Both are already
 * pending targets so a human can route one through the inbox; a conversational proposal
 * would be a second door onto the same commitment.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { board, openScenarios } from './queries'
import { capacityQuery, compareScenario } from './service'

const noArgs = z.object({}).passthrough()

const boardInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
  days: z.number().int().min(1).max(90).default(21),
})

const capacityInput = z.object({
  styleCode: z.string().min(1),
  qty: z.number().int().positive(),
  lineIds: z.array(z.string().uuid()).min(1),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  productType: z.string().optional(),
})

const scenarioInput = z.object({ scenarioId: z.string().uuid() })

const lineBoard: ReadTool = {
  kind: 'read',
  name: 'planning.board',
  description:
    'The line-by-day board over a window: what each line is loaded with, its capacity that ' +
    'day, and where it is over-committed. A day with no shift on the calendar has no ' +
    'capacity rather than zero output — they read the same on a chart and mean different ' +
    'things.',
  input: boardInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = boardInput.parse(args)
    return board(ctx, input)
  },
}

const capacity: ReadTool = {
  kind: 'read',
  name: 'planning.capacity_query',
  description:
    'Could these lines make this quantity of this style on these days? Runs the real ' +
    'capacity arithmetic from the style’s SMV, each line’s manpower and the learning curve ' +
    'for the product. Refuses when the style has no SMV on record — that refusal is the ' +
    'answer, and inventing an SMV would commit the factory to a date it cannot make.',
  input: capacityInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = capacityInput.parse(args)
    return capacityQuery(ctx, input)
  },
}

const scenarios: ReadTool = {
  kind: 'read',
  name: 'planning.open_scenarios',
  description:
    'Planning scenarios somebody has forked and not yet applied — proposed rearrangements ' +
    'of the board that are not what the floor is working to.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => openScenarios(ctx),
}

const compare: ReadTool = {
  kind: 'read',
  name: 'planning.compare_scenario',
  description:
    'What one scenario would change against the live board: which allocations move, and ' +
    'what it does to the dates. Nothing is applied — a scenario that no longer fits the ' +
    'board says so rather than being applied over the top of what has moved since.',
  input: scenarioInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { scenarioId } = scenarioInput.parse(args)
    const { getPolicy } = await import('@/modules/settings/service')
    const policy = await getPolicy<Record<string, never>>(ctx, 'planning')
    return compareScenario(ctx, {
      scenarioId,
      policy: policy as unknown as Parameters<typeof compareScenario>[1]['policy'],
    })
  },
}

export const planningToolPack: ToolPack = {
  moduleId: 'planning',
  tools: [lineBoard, capacity, scenarios, compare],
}
