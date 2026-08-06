/**
 * MARBIM tools for 2.3 Sampling Room.
 *
 * Two questions, and they are asked days apart by different people. A merchandiser about to
 * cut a new style asks "have we made this before, and what did the buyer say?" — and a
 * planner asks "is the PP sample going to stop cutting on Monday?"
 *
 * **The library search is the one that saves money.** A factory that cannot answer it
 * remakes the same collar three seasons running and is corrected on it three times, paying
 * for each sample. `sampling.search_library` reads the buyer's own comments, not just style
 * codes: somebody chasing a fabric problem searches "puckering", and a search over
 * identifiers alone returns nothing for the question most worth asking.
 *
 * **The PP gate is a read of the real gate.** `sampling.pp_approval` resolves the same
 * provider `createLay` calls, so what it says is what the cutting floor will be told.
 *
 * **The feedback draft transcribes a comment sheet.** A buyer's verdict arrives as a PDF of
 * marked-up photographs and prose; typing it is the error-prone clerical act. The verdict
 * itself scores lowest because it is the one field that clears or blocks a cutting floor —
 * "approved with comments" read as "approved" starts eighty thousand garments.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { DraftTool, ReadTool, ToolPack } from '../marbim/tools'

import { ppApprovedStyles, sampleBoard, sampleLibrary } from './queries'
import {
  checkPpApprovalFor,
  overdueSamples,
  ppBlockingAlerts,
  sampleTimeline,
  type SamplingPolicy,
} from './service'

/** The tenant's own blocking window — how early an unapproved PP starts shouting. */
async function policyFor(ctx: AnyCtx): Promise<SamplingPolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<SamplingPolicy>(ctx, 'sampling')
}

const noArgs = z.object({}).passthrough()

const todayInput = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar date, YYYY-MM-DD'),
})

const sampleInput = z.object({
  sampleRequestId: z.string().uuid(),
})

const gateInput = z.object({
  orderId: z.string().uuid(),
  orderStyleId: z.string().uuid(),
})

const searchInput = z.object({
  query: z.string().optional(),
  type: z.enum(['proto', 'fit', 'sms', 'pp', 'top', 'shipment']).optional(),
  outcome: z.enum(['approved', 'rejected', 'undecided']).optional(),
  limit: z.number().int().min(1).max(60).optional(),
})

const board: ReadTool = {
  kind: 'read',
  name: 'sampling.board',
  description:
    'Every sample in the room with its type, stage, due date and latest buyer verdict. A PP ' +
    'sample is the one that gates cutting — lead with those.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => sampleBoard(ctx, { now: new Date() }),
}

const search: ReadTool = {
  kind: 'read',
  name: 'sampling.search_library',
  description:
    'Search past samples by style, request number, buyer, OR the text of what the buyer ' +
    'actually said — "puckering", "collar stand". Returns the verdict, how many rounds it ' +
    'took, and the comments themselves. Use this before anybody makes a style again: a ' +
    'sample that was approved on the third attempt carries the two rejections worth reading.',
  input: searchInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const filter = searchInput.parse(args)
    return sampleLibrary(ctx, filter)
  },
}

const timeline: ReadTool = {
  kind: 'read',
  name: 'sampling.sample_timeline',
  description:
    'One sample end to end: every stage it passed through and every feedback round WITH the ' +
    'buyer’s itemised comments. Quote the comments; a verdict without them is a sample ' +
    'nobody can remake correctly.',
  input: sampleInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { sampleRequestId } = sampleInput.parse(args)
    return sampleTimeline(ctx, sampleRequestId)
  },
}

const ppGate: ReadTool = {
  kind: 'read',
  name: 'sampling.pp_approval',
  description:
    'Has the buyer approved the pre-production sample for this order and style? This resolves ' +
    'the same gate the cutting floor is refused by, so the answer is what will actually ' +
    'happen. If it has not been approved, say so and what is outstanding — never suggest ' +
    'cutting ahead of it.',
  input: gateInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = gateInput.parse(args)
    return checkPpApprovalFor(ctx, input)
  },
}

const blocking: ReadTool = {
  kind: 'read',
  name: 'sampling.pp_blocking_cutting',
  description:
    'PP samples with no approval whose orders are close enough to cutting to matter, inside ' +
    'the factory’s own escalation window. This is the list that stops a cutting table next ' +
    'week — the useful answer names the order and the days remaining.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return ppBlockingAlerts(ctx, { today }, await policyFor(ctx))
  },
}

const overdue: ReadTool = {
  kind: 'read',
  name: 'sampling.overdue',
  description: 'Samples past their due date with no verdict — what the buyer has not answered on.',
  input: todayInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { today } = todayInput.parse(args)
    return overdueSamples(ctx, { today })
  },
}

const approvedStyles: ReadTool = {
  kind: 'read',
  name: 'sampling.pp_approved_styles',
  description: 'Style codes with an approved PP sample — the styles cutting is cleared for.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => ppApprovedStyles(ctx),
}

/**
 * The feedback draft.
 *
 * The verdict scores lowest of everything here, and it is the smallest field. It is also
 * the one that clears or blocks a cutting floor: "approved with comments" transcribed as
 * "approved" starts eighty thousand garments against a sample the buyer asked to change.
 * The round number is not in the payload at all — `recordFeedbackIn` assigns it under a row
 * lock, precisely so a caller cannot reuse one and overwrite a verdict.
 */
const proposeFeedbackInput = z.object({
  sampleRequestId: z.string().uuid(),
  verdict: z.enum(['approved', 'approved_with_comments', 'rejected']),
  comments: z
    .array(
      z.object({
        area: z.string().min(1),
        comment: z.string().min(1),
        page: z.number().int().min(1).optional(),
      }),
    )
    .default([]),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  documentId: z.string().uuid().optional(),
})

const proposeFeedback: DraftTool = {
  kind: 'draft',
  name: 'sampling.propose_feedback_round',
  targetTable: 'sample_feedback_rounds',
  description:
    'Propose a buyer’s verdict read off their comment sheet, with the itemised comments and ' +
    'the page each came from. It goes to the approve inbox: this verdict is what the PP gate ' +
    'reads, so an approval transcribed from a conditional one would clear a cutting floor ' +
    'the buyer had not cleared.',
  input: proposeFeedbackInput,
  execute: async (_ctx: AnyCtx, args: unknown) => {
    const feedback = proposeFeedbackInput.parse(args)

    return {
      targetTable: 'sample_feedback_rounds',
      operation: 'insert' as const,
      zodSchemaKey: 'feedback_round',
      payload: feedback,
      // Read the verdict. `approved`, `approved_with_comments` and `rejected` are one
      // word apart on the page and a floor apart in meaning — this is the field that
      // opens cutting.
      method: 'read from a buyer comment sheet · the verdict is what gates cutting',
      ...(feedback.documentId ? { sourceDocumentId: feedback.documentId } : {}),
    }
  },
}

export const samplingToolPack: ToolPack = {
  moduleId: 'sampling',
  tools: [board, search, timeline, ppGate, blocking, overdue, approvedStyles, proposeFeedback],
}
