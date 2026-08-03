/**
 * MARBIM tools for 2.2 Commercial — letters of credit and utilization declarations.
 *
 * This is the module where a wrong answer costs the most. An LC's latest-shipment date and
 * its expiry are what decide whether a bank pays; a UD's balance is what decides whether
 * issuing bonded fabric is a customs offence. The primer taught all of that to an assistant
 * that could not read a single credit.
 *
 * **Every tool returns the countdown alongside the date.** "Expires 2026-09-29" and "expires
 * in 8 days" are the same fact and land completely differently on somebody deciding whether
 * to ship this week, and the module's own read models already compute the days — a model
 * left to subtract dates itself would eventually get it wrong quietly.
 *
 * **The UD draw is a check, never a draw.** `commercial.check_ud_draw` runs the same gate
 * `drawUd` enforces and takes no lock, so it answers "would this be allowed" without
 * consuming anything. Actually drawing belongs to the store's issue transaction, where the
 * row lock makes two storekeepers issuing the last of a roll serialise.
 *
 * **No draft tool.** Everything drafted here is a legal document transcription — a UD scan —
 * and that has its own path through MARBIM's document intake, where the person holding the
 * paper says what it is. A second, chattier route to the same table would be a way to
 * propose a customs declaration from a conversation.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { exposureByCurrency, lcDetail, register } from './queries'
import { checkUdBalance, getUdBalance, type BankDocsPolicy } from './service'
import { udRegister } from './ud-queries'

/** The tenant's own commercial policy — the BTB ceiling is negotiated, not universal. */
async function policyFor(ctx: AnyCtx): Promise<BankDocsPolicy> {
  const { getPolicy } = await import('@/modules/settings/service')
  return getPolicy<BankDocsPolicy>(ctx, 'commercial')
}

const noArgs = z.object({}).passthrough()

const registerInput = z.object({
  expiringWithinDays: z.number().int().min(1).max(365).default(30),
})

const lcInput = z.object({
  lcId: z.string().uuid(),
})

const udInput = z.object({
  udId: z.string().uuid(),
})

const drawInput = z.object({
  udId: z.string().uuid(),
  itemRef: z.string().min(1),
  qty: z.string().min(1),
  unit: z.string().min(1),
})

const lcRegister: ReadTool = {
  kind: 'read',
  name: 'commercial.lc_register',
  description:
    'Every active letter of credit with its value, latest shipment date, expiry, days ' +
    'remaining on each, and BTB utilisation against its limit. Latest shipment and expiry ' +
    'are different deadlines and both matter — goods shipped after the latest shipment date ' +
    'produce discrepant documents even when the credit has not expired.',
  input: registerInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { expiringWithinDays } = registerInput.parse(args)
    const policy = await policyFor(ctx)
    return register(ctx, {
      now: new Date(),
      expiringWithinDays,
      btbLimitPct: policy.btbLimitPct ?? 100,
    })
  },
}

const lcOne: ReadTool = {
  kind: 'read',
  name: 'commercial.lc_detail',
  description:
    'One credit in full: its amendments, the back-to-back credits opened against it with ' +
    'the headroom left, and its document submissions. Use this before answering anything ' +
    'about whether a shipment can be funded.',
  input: lcInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { lcId } = lcInput.parse(args)
    const policy = await policyFor(ctx)
    return lcDetail(ctx, lcId, policy.btbLimitPct ?? 100)
  },
}

const exposure: ReadTool = {
  kind: 'read',
  name: 'commercial.exposure',
  description:
    'Open credit value by currency, and how many credits make it up. Never total across ' +
    'currencies — there is no rate here, and a summed figure would be invented.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => exposureByCurrency(ctx),
}

const uds: ReadTool = {
  kind: 'read',
  name: 'commercial.ud_register',
  description:
    'Utilization declarations with their validity and how much of each authorised item is ' +
    'left. A UD is what makes duty-free bonded fabric lawful to use, so an expiring one is ' +
    'urgent even when its balance is untouched.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => udRegister(ctx, { now: new Date() }),
}

const udBalance: ReadTool = {
  kind: 'read',
  name: 'commercial.ud_balance',
  description:
    'One declaration’s ledger: authorised, consumed and free balance for every item on it.',
  input: udInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const { udId } = udInput.parse(args)
    return getUdBalance(ctx, udId)
  },
}

const udDraw: ReadTool = {
  kind: 'read',
  name: 'commercial.check_ud_draw',
  description:
    'Would drawing this quantity against this UD be allowed? Runs the same balance gate the ' +
    'store’s issue enforces and consumes nothing. If it refuses, say the shortfall and that ' +
    'an overdraw needs an owner’s written override — overdrawing a UD is duty owed and a ' +
    'penalty, not a paperwork slip, so never suggest issuing anyway.',
  input: drawInput,
  execute: async (ctx: AnyCtx, args: unknown) => {
    const input = drawInput.parse(args)
    return checkUdBalance(ctx, input)
  },
}

export const commercialToolPack: ToolPack = {
  moduleId: 'commercial',
  tools: [lcRegister, lcOne, exposure, uds, udBalance, udDraw],
}
