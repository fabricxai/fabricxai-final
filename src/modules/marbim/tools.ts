/**
 * The tool contract (brief X.2: "per-module tool packs: read tools + draft tools only").
 *
 * `ModuleDefinition.toolPack` was `unknown` — a placeholder from the day the registry was
 * written. This gives it a shape, and the shape is where the safety lives.
 *
 * ## Why two kinds of tool and not one with a flag
 *
 * A READ tool returns data. A DRAFT tool returns a PROPOSAL — a payload plus the per-field
 * confidence behind it — and nothing else. It cannot write, because it is not given anything
 * to write with: its executor returns a value, and `runDraftTool` is the only thing that
 * turns that value into a `pending_changes` row.
 *
 * Making them separate types rather than one type with `writes: true` means the compiler
 * carries the rule. A draft tool cannot accidentally be registered as a read tool that
 * happens to insert something, because a read tool's return type has nowhere for a proposal
 * to go.
 *
 * There is deliberately no third kind. A tool that commits directly would make the entire
 * trust layer decoration (CLAUDE.md rule 3), and the way to guarantee it does not exist is
 * for there to be no type that could describe it.
 */
import type { ZodType } from 'zod'

import type { AnyCtx } from '../core/ctx'

/** What every tool declares so a model can choose it and a client can scope it. */
interface ToolBase {
  /** `orders.find_by_po`. Namespaced so two modules cannot collide. */
  name: string
  /** What it does, in the words a model needs to pick it. */
  description: string
  /** Arguments, validated before the executor sees them. */
  input: ZodType
  /**
   * Argument names the CLIENT's context may fill in — the current order id, the current
   * line. Never `companyId`; see `scopeToolDefaults`.
   */
  scopedArgs?: readonly string[]
}

/**
 * A tool that answers a question.
 *
 * Its executor gets a `ctx`, so RLS binds it exactly as it binds a request, and returns
 * plain data. There is no path from here to a write.
 */
export interface ReadTool<TArgs = unknown, TResult = unknown> extends ToolBase {
  kind: 'read'
  execute: (ctx: AnyCtx, args: TArgs) => Promise<TResult>
}

/**
 * What a draft tool hands back: a payload, and the measurement behind every field of it.
 *
 * `method` and `fieldConfidence` are not optional. A proposal with no per-field confidence
 * is refused before it becomes a draft, because the approve inbox sorts by exactly that and
 * a missing number would sort as though it were a good one.
 */
export interface ToolProposal {
  /** Which registered target this becomes. Checked against the module's whitelist. */
  targetTable: string
  targetId?: string
  operation: 'insert' | 'update' | 'delete'
  payload: Record<string, unknown>
  /** The named schema `pending_changes` re-validates with at approve time. */
  zodSchemaKey: string
  fieldConfidence: Record<string, number>
  /** How the confidence was produced. Constants are refused — see `marbim.ts`. */
  method: string
  uniformConfidenceJustification?: string
  sourceDocumentId?: string
  /** What the model was looking at. Shown to the reviewer beside the draft. */
  evidence?: { label: string; page?: number; quote?: string }[]
}

/**
 * A tool that proposes a change.
 *
 * The executor returns a proposal and NOTHING is written by it. `runDraftTool` validates the
 * confidence and calls `propose`, which is the only door into `pending_changes`.
 */
export interface DraftTool<TArgs = unknown> extends ToolBase {
  kind: 'draft'
  /** The registered target this tool may propose against. */
  targetTable: string
  execute: (ctx: AnyCtx, args: TArgs) => Promise<ToolProposal>
}

export type ModuleTool = ReadTool | DraftTool

export interface ToolPack {
  moduleId: string
  tools: readonly ModuleTool[]
}

export class ToolPackError extends Error {
  override readonly name = 'ToolPackError'
}

/**
 * Check a pack against the module that registered it.
 *
 * Every failure here is a wiring mistake that would otherwise surface as a model doing
 * something surprising in production, which is the worst possible place to find it.
 */
export function validateToolPack(
  pack: ToolPack,
  registered: { pendingTargets: readonly string[] },
): void {
  const seen = new Set<string>()

  for (const tool of pack.tools) {
    if (!tool.name.startsWith(`${pack.moduleId}.`)) {
      // Namespaced so two modules cannot register the same tool name and silently shadow
      // each other in whatever order they happened to load.
      throw new ToolPackError(
        `tool "${tool.name}" must be namespaced as "${pack.moduleId}.<something>"`,
      )
    }
    if (seen.has(tool.name)) {
      throw new ToolPackError(`tool "${tool.name}" is registered twice`)
    }
    seen.add(tool.name)

    if (!tool.description.trim()) {
      // A model picks a tool by its description. An empty one is a tool that will be
      // chosen at random or never.
      throw new ToolPackError(`tool "${tool.name}" has no description`)
    }

    for (const arg of tool.scopedArgs ?? []) {
      if (arg === 'companyId') {
        // The one that matters. Tenancy comes from the session; a tool that let a client
        // scope it could read another factory's book.
        throw new ToolPackError(`tool "${tool.name}" must not scope companyId from the client`)
      }
    }

    if (tool.kind === 'draft' && !registered.pendingTargets.includes(tool.targetTable)) {
      // A draft tool aimed at a table the module never whitelisted would be refused by
      // `propose` at runtime. Catching it here means the mistake is found when the module
      // loads rather than when somebody tries to use it.
      throw new ToolPackError(
        `draft tool "${tool.name}" targets "${tool.targetTable}", which ${pack.moduleId} has not registered as a pending target`,
      )
    }
  }
}

/** Every tool a model may be offered, given the modules in scope. */
export function collectTools(packs: readonly ToolPack[]): ModuleTool[] {
  return packs
    .flatMap((pack) => pack.tools)
    // Sorted so the tool list handed to a model is stable — an unstable list makes two
    // identical questions produce different prompts and therefore different answers.
    .sort((a, b) => a.name.localeCompare(b.name))
}
