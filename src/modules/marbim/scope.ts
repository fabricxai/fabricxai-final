/**
 * Which tools a caller may actually use (plan 6.5, audit AI-H6).
 *
 * The assistant surface has told every user, in the caption under the composer, that "MARBIM
 * reads what your role can already read". That was not true. Every registered pack in scope
 * went into the prompt regardless of who was asking — so a viewer's conversation advertised
 * `workforce.payroll_run`, and once 6.5 made tools EXECUTABLE the same list would have run
 * them. The caption is the promise; this is the code that keeps it.
 *
 * ## The audience is the nav's, deliberately
 *
 * `nav.ts` already answers "who may see this module" and "who may write in it", it is the
 * answer the sidebar and `resolveAccess` use, and it is the one the action layer gates on. A
 * second list here would be a second truth, and the one that drifted would be the one deciding
 * whether a model may read a payroll run.
 *
 *  - a READ tool needs `canSee` on its module — MARBIM never widens what a person can reach;
 *  - a DRAFT tool needs `canWrite`. It proposes into somebody's approve inbox and the drafts
 *    are attributed to the person who asked, so "can this person cause that row to exist" is
 *    exactly the write question the nav already answers.
 *
 * A module with no nav entry contributes no tools. Fail-closed, the same default 0.2 set on
 * the route gate: a module nobody has decided an audience for is not one a model gets to use
 * on everybody's behalf.
 */
import { canSee, canWrite, NAV, type FactoryType } from '@/components/shell/nav'

import type { Role } from '../core/ctx'

import type { ModuleTool, ToolPack } from './tools'

/** Tool names are namespaced `<moduleId>.<something>` and `validateToolPack` enforces it. */
export const moduleOfTool = (name: string): string => name.split('.')[0] ?? ''

export interface ScopeInput {
  packs: readonly ToolPack[]
  roles: readonly Role[]
  factoryType: FactoryType
}

/**
 * Filter packs down to what these roles may use.
 *
 * Returns tools rather than packs: the caller needs a flat list to hand the model and to
 * match executions against, and a half-filtered pack would be a shape inviting somebody to
 * use `pack.tools` again by mistake.
 */
export function toolsForRoles({ packs, roles, factoryType }: ScopeInput): ModuleTool[] {
  const allowed: ModuleTool[] = []

  for (const pack of packs) {
    const item = NAV.find((entry) => entry.id === pack.moduleId)

    // No nav entry, no audience, no tools. `marbim` itself is the notable case — it has an
    // entry, so its own read tools follow the same rule as everything else.
    if (!item) continue

    const readable = canSee(item, roles, factoryType)
    if (!readable) continue

    const writable = canWrite(item, roles, factoryType)

    for (const tool of pack.tools) {
      if (tool.kind === 'draft' && !writable) continue
      allowed.push(tool)
    }
  }

  return allowed
}

/**
 * The modules whose PRIMERS this caller should get.
 *
 * The same question one layer up, and it matters for a reason that is easy to miss: a primer
 * teaches MARBIM a department's craft, and the workforce primer describes how gazette wage
 * grades and festival bonuses work. That is not a payroll figure — it is domain knowledge,
 * and teaching it to a conversation a storekeeper is having leaks nothing about anybody's
 * wages. But it costs tokens in every request, and a primer for a module whose tools this
 * person cannot call is prompt the model can only frustrate itself with.
 *
 * So: readable modules only. Narrower than before, cheaper, and it keeps "what MARBIM knows
 * in this conversation" aligned with "what this person can act on".
 */
export function primerModulesForRoles(
  moduleIds: readonly string[],
  roles: readonly Role[],
  factoryType: FactoryType,
): string[] {
  return moduleIds.filter((moduleId) => {
    const item = NAV.find((entry) => entry.id === moduleId)
    // A module with no nav entry keeps its primer: `core` and the platform modules teach
    // things that are not a department's private business, and dropping them would quietly
    // change what MARBIM knows about approvals for everyone.
    if (!item) return true
    return canSee(item, roles, factoryType)
  })
}
