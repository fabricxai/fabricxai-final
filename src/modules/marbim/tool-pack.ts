/**
 * MARBIM's tools for reading its own record.
 *
 * Not introspection for its own sake. The question this answers is the one an owner should
 * be asking before trusting anything the assistant drafts: **how often has it been wrong?**
 *
 * `extractorScores` is the correction rate per extractor VERSION — how much of what it
 * proposed a human changed before approving. That number is the only honest basis for
 * widening what MARBIM is allowed to draft, and it was computed and unreadable.
 *
 * **No draft tool, and there could not be one.** `pendingTargets` is empty: this module
 * proposes into OTHER modules' tables and owns none of its own. A draft tool here would
 * have nothing legitimate to target.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from './tools'

import { extractorScores, recentJobs } from './service'

const noArgs = z.object({}).passthrough()
const listInput = z.object({ limit: z.number().int().min(1).max(100).optional() })

const scores: ReadTool = {
  kind: 'read',
  name: 'marbim.extractor_scores',
  description:
    'Correction rate per extractor and version — how much of what each proposed a reviewer ' +
    'changed before approving. Null until somebody has actually reviewed drafts from that ' +
    'version, which is not the same as a perfect score. This is the number to quote when ' +
    'anybody asks whether MARBIM can be trusted with more.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => extractorScores(ctx),
}

const jobs: ReadTool = {
  kind: 'read',
  name: 'marbim.recent_extractions',
  description:
    'Recent document extractions with their status, attempts and what they drafted. A ' +
    '`rejected` job will not be retried — what it read did not fit the target — and that is ' +
    'a document somebody still has to type by hand.',
  input: listInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { limit } = listInput.parse(args)
    return recentJobs(ctx, limit === undefined ? {} : { limit })
  },
}

export const marbimToolPack: ToolPack = {
  moduleId: 'marbim',
  tools: [scores, jobs],
}
