/**
 * Module registry — the whitelist that makes `pending_changes` safe.
 *
 * A module declares, in its `register.ts`, exactly which tables an AI or junior draft
 * may target and which Zod schema validates each payload. `pending_changes` inserts and
 * approves both resolve through here; a target that is not registered is rejected
 * outright, which is what stops a drafted write from reaching an arbitrary table
 * (CLAUDE.md rule 3).
 */
import type { ZodType } from 'zod'

import type { Role } from './ctx'
import { AppError } from './errors'

export interface ModuleDefinition {
  /** Folder name under src/modules, e.g. 'orders'. */
  id: string
  /** Tables this module may receive drafts for. Nothing else is writable via drafts. */
  pendingTargets: readonly string[]
  /**
   * zodSchemaKey → schema. The key is stored on the draft row so approve re-validates
   * with a named schema rather than re-deriving one from the payload shape.
   */
  zodMap: Readonly<Record<string, ZodType>>
  /** Fallback approver roles when no approval_rules row matches. */
  approvalDefaults: { requiredRoles: readonly Role[]; approvalsRequired?: number }
  /** MARBIM tool pack: read tools + draft tools only. Draft tools emit pending rows. */
  toolPack?: unknown
  /** BullMQ processors owned by this module. */
  jobs?: Readonly<Record<string, unknown>>
  /**
   * Versioned prompt fragment giving MARBIM this department's craft. Teaches WHEN to
   * call a computation and how to narrate the result — the computation itself stays in
   * service.ts (CLAUDE.md, module folder contract).
   */
  domainPrimer?: { version: string; text: string }
}

const registry = new Map<string, ModuleDefinition>()

export function registerModule(definition: ModuleDefinition): ModuleDefinition {
  const existing = registry.get(definition.id)
  if (existing && existing !== definition) {
    throw new Error(`module "${definition.id}" is already registered`)
  }

  for (const target of definition.pendingTargets) {
    // Same shape the pending_changes CHECK constraint enforces in the database.
    if (!/^[a-z_][a-z0-9_]*$/.test(target)) {
      throw new Error(`module "${definition.id}": "${target}" is not a valid table name`)
    }
    const owner = [...registry.values()].find((m) => m.pendingTargets.includes(target))
    if (owner) {
      // One writer module per table (CLAUDE.md rule 11) — two modules drafting into the
      // same table is the bug that makes "who wrote this row?" unanswerable.
      throw new Error(
        `table "${target}" is already a pending target of module "${owner.id}"; ` +
          `read it through that module's queries.ts instead`,
      )
    }
  }

  registry.set(definition.id, definition)
  return definition
}

export const getModule = (id: string): ModuleDefinition | undefined => registry.get(id)
export const listModules = (): readonly ModuleDefinition[] => [...registry.values()]

/**
 * Resolve the schema for a draft, or throw. Called at insert AND at approve — a schema
 * that has tightened since the draft was created must reject it at approve time rather
 * than commit stale data (PLAYBOOK §3, the X.1 re-validation test).
 */
export function resolvePendingSchema(moduleId: string, targetTable: string, zodSchemaKey: string) {
  const definition = registry.get(moduleId)
  if (!definition) {
    throw new AppError('validation_failed', 'errors.unknown_module', { moduleId })
  }
  if (!definition.pendingTargets.includes(targetTable)) {
    throw new AppError('forbidden', 'errors.target_not_registered', { moduleId, targetTable })
  }
  const schema = definition.zodMap[zodSchemaKey]
  if (!schema) {
    throw new AppError('validation_failed', 'errors.unknown_schema', { moduleId, zodSchemaKey })
  }
  return schema
}

/** Test-only: the registry is module-global, so suites must be able to reset it. */
export const __resetRegistry = (): void => registry.clear()
