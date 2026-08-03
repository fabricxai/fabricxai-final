/**
 * MARBIM tools for X.3 Settings.
 *
 * Read-only, and firmly so. A policy you cannot see is a policy you cannot question — the
 * margin floor, the AQL standard, the BTB ceiling and the over-receipt allowance all shape
 * answers given elsewhere in this system, and being able to say "that refusal came from
 * YOUR 10% floor" is the difference between an explanation and an assertion.
 *
 * **Nothing here changes anything.** Setting a policy is owner-and-admin only, and it moves
 * a number that gates money and compliance across every other module. `pendingTargets` is
 * empty so there is not even a table a draft could aim at.
 */
import { z } from 'zod'

import type { AnyCtx } from '../core/ctx'
import type { ReadTool, ToolPack } from '../marbim/tools'

import { auditedTables, companyProfile, disabledModules, listPolicies, roleMatrix } from './service'

const noArgs = z.object({}).passthrough()

const policies: ReadTool = {
  kind: 'read',
  name: 'settings.policies',
  description:
    'Every policy this factory has set, by module — the margin floor, AQL standard, BTB ' +
    'ceiling, over-receipt allowance and the rest. When a gate refuses something, quote the ' +
    'policy behind it: a refusal that names the number somebody chose is answerable, and ' +
    'one that does not is just a wall.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => listPolicies(ctx),
}

const profile: ReadTool = {
  kind: 'read',
  name: 'settings.company_profile',
  description:
    'The factory itself: display name, factory type and timezone. Factory type decides which ' +
    'screens exist — a woven unit has no knitting floor.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => companyProfile(ctx),
}

const roles: ReadTool = {
  kind: 'read',
  name: 'settings.role_matrix',
  description:
    'Who holds which role. Useful for answering "who can approve this" — but say the role ' +
    'that is needed rather than naming a person to go around a gate with.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => roleMatrix(ctx),
}

const disabled: ReadTool = {
  kind: 'read',
  name: 'settings.disabled_modules',
  description:
    'Modules this factory has switched off. A module that is off has no data rather than ' +
    'empty data — never report it as nothing happening.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => disabledModules(ctx),
}

const audited: ReadTool = {
  kind: 'read',
  name: 'settings.audited_tables',
  description:
    'Tables whose every change is written to the audit log — the ⚖ ones. Worth knowing when ' +
    'somebody asks whether a change can be traced later.',
  input: noArgs,
  execute: async (ctx: AnyCtx) => auditedTables(ctx),
}

export const settingsToolPack: ToolPack = {
  moduleId: 'settings',
  tools: [policies, profile, roles, disabled, audited],
}
