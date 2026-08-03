/**
 * MARBIM tools for 10.1 Workforce 🔒
 *
 * This pack is deliberately smaller than the module, and the omission is the design.
 *
 * **No per-worker pay, at all.** `getPayrollLines` exists, is role-gated and audits every
 * read — and it still does not belong here. A chat answer is persisted in `chat_turns`,
 * which is a different table with different access rules from `payroll_lines`: putting one
 * person's wage into a conversation copies it out from under the protection it was given
 * and into a transcript anybody who can open that thread can re-read. The audit would
 * faithfully record the read and the copy would already exist.
 *
 * So this offers headcount and roster, which carry no money, and the gazette and run LIST,
 * which are rates and totals rather than individuals — each behind `assertPayrollAccess`,
 * which throws a 403 carrying NOTHING. That empty body is deliberate (rule 9): naming the
 * role it wanted would confirm the endpoint exists and name the role worth phishing for.
 *
 * The tools call the gated service functions rather than reimplementing them, so a
 * merchandiser asking gets the same silent refusal they would get from the screen. MARBIM
 * reads what your role can already read — never more.
 *
 * **No draft tool.** `wage_gazettes` is a pending target so a scanned government
 * notification can be transcribed through document intake, where a person says what the
 * paper is. A conversational route to proposing wage rates is not something this module
 * should own.
 */
import { z } from 'zod'

import type { AnyCtx, RequestCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { activeGazette, headcount, payrollRunList, roster } from './queries'

const noArgs = z.object({}).passthrough()
const listInput = z.object({ limit: z.number().int().min(1).max(200).optional() })

const people: ReadTool = {
  kind: 'read',
  name: 'workforce.roster',
  description:
    'Workers on the roster with their grade, line and joining date. No pay figures — grade ' +
    'is a band, not a wage.',
  input: listInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { limit } = listInput.parse(args)
    return roster(ctx, limit)
  },
}

const counts: ReadTool = {
  kind: 'read',
  name: 'workforce.headcount',
  description: 'Headcount by line and grade — how the floor is staffed. Carries no money.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => headcount(ctx),
}

const gazette: ReadTool = {
  kind: 'read',
  name: 'workforce.active_gazette',
  description:
    'The wage gazette in force and its grade table. 🔒 HR and owner only. These are the ' +
    'government’s published rates, never a rate to quote from memory — they change by ' +
    'notification, and an out-of-date figure underpays somebody.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => activeGazette(ctx as RequestCtx),
}

const runs: ReadTool = {
  kind: 'read',
  name: 'workforce.payroll_runs',
  description:
    'Payroll runs with their period, status and totals. 🔒 HR and owner only, and TOTALS ' +
    'only — no individual’s pay is available through this surface. An approved run is what ' +
    'people were told they would receive; a correction is a separate adjustment next period, ' +
    'never a rewrite.',
  input: listInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { limit } = listInput.parse(args)
    return payrollRunList(ctx as RequestCtx, limit)
  },
}

export const workforceToolPack: ToolPack = {
  moduleId: 'workforce',
  tools: [people, counts, gazette, runs],
}
