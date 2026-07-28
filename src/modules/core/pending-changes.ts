/**
 * pending_changes v2 — propose → approve → commit (architecture §1.1, dev-plan §2.2.2).
 *
 * The only path by which AI or junior writes reach business tables. Nothing here is a
 * feature; it is the architectural layer a skeptical factory owner is being asked to
 * trust, so the refusals matter more than the happy path:
 *
 *  - The target table must be registered in the owning module's `register.ts`. An
 *    unregistered table is rejected outright (CLAUDE.md rule 3).
 *  - The payload is validated by the module's Zod schema at insert AND AGAIN at approve.
 *    Schemas tighten over time; a draft written under a looser one must not commit under
 *    the newer one (PLAYBOOK §3, the X.1 re-validation test).
 *  - Confidence is per field and comes from the extractor. A constant is a bug.
 *  - Approve is idempotent under contention: the row is locked, and a second approve gets
 *    a typed 409 while exactly one commit happens (architecture §9).
 *
 * Commit, audit row and outbox event all happen in ONE transaction. That is what makes
 * the chain draft → reviewer → committed row auditable end to end.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { ZodType } from 'zod'

import { approvalRules, pendingChanges } from '@/db/schema/core'

import { recordChange } from './audit'
import type { AnyCtx, RequestCtx, Role } from './ctx'
import { AppError, conflict, notFound } from './errors'
import { emit } from './outbox'
import { getModule, resolvePendingSchema } from './registry'
import { type TenantDb, withTenantTx } from './tenancy'

type Operation = 'insert' | 'update' | 'delete'
type Source = 'ai_extraction' | 'ai_chat' | 'user_draft' | 'import' | 'integration'

export interface ProposeInput {
  moduleId: string
  targetTable: string
  targetId?: string
  operation: Operation
  payload: Record<string, unknown>
  zodSchemaKey: string
  /** Per field, straight from the extractor. Empty is allowed only for human drafts. */
  fieldConfidence?: Record<string, number>
  source: Source
  sourceDocumentId?: string
  extractorVersion?: string
  model?: string
}

export interface ApproveInput {
  pendingChangeId: string
  /** Field-level edits the reviewer made — this is the correction telemetry. */
  corrections?: Record<string, unknown>
  note?: string
}

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/

/**
 * Confidence must come from the extractor. A model-authored draft carrying none is
 * exactly what the approve inbox exists to make visible, so it is refused at the door
 * rather than displayed as though the number meant something.
 */
function validateConfidence(source: Source, fieldConfidence: Record<string, number>): void {
  const machineAuthored = source === 'ai_extraction' || source === 'ai_chat'
  const entries = Object.entries(fieldConfidence)

  if (machineAuthored && entries.length === 0) {
    throw new AppError(
      'validation_failed',
      'errors.confidence_required',
      { source },
      'AI-sourced drafts must carry per-field confidence from the extractor',
    )
  }

  for (const [field, value] of entries) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
      throw new AppError('validation_failed', 'errors.confidence_out_of_range', { field, value })
    }
  }
}

function lowestConfidence(fieldConfidence: Record<string, number>): string | null {
  const values = Object.values(fieldConfidence)
  if (values.length === 0) return null
  return Math.min(...values).toFixed(3)
}

function parseOrThrow(schema: ZodType, payload: unknown): Record<string, unknown> {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError('validation_failed', 'errors.payload_invalid', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  // Zod strips unknown keys, so the output is exactly what the module declared — which is
  // also what makes it safe to turn into column names below.
  return parsed.data as Record<string, unknown>
}

/**
 * The rule governing a draft: the highest-priority active rule whose module, table and
 * operation match, else the module's registered defaults.
 */
async function resolveRule(
  tx: TenantDb,
  ctx: AnyCtx,
  draft: { moduleId: string; targetTable: string; operation: Operation },
): Promise<{ requiredRoles: readonly Role[]; autoApprove: boolean; minConfidence: string | null }> {
  const rules = await tx
    .select()
    .from(approvalRules)
    .where(and(eq(approvalRules.companyId, ctx.companyId), eq(approvalRules.isActive, true)))
    .orderBy(sql`${approvalRules.priority} desc`)

  const match = rules.find(
    (rule) =>
      rule.moduleId === draft.moduleId &&
      (rule.targetTable === null || rule.targetTable === draft.targetTable) &&
      (rule.operation === null || rule.operation === draft.operation),
  )

  if (match) {
    return {
      requiredRoles: match.requiredRoles,
      autoApprove: match.autoApprove,
      minConfidence: match.minConfidence,
    }
  }

  const definition = getModule(draft.moduleId)
  return {
    requiredRoles: definition?.approvalDefaults.requiredRoles ?? ['owner'],
    autoApprove: false,
    minConfidence: null,
  }
}

/**
 * Propose a change. Validates the target against the registry whitelist and the payload
 * against the module's Zod schema before anything is written.
 *
 * Auto-approval is decided here and only here: a rule may skip the human, but only if it
 * declares a confidence floor AND *every* field clears it. That is why confidence is
 * stored per field — an average hides the one field the extractor was unsure about.
 */
export async function propose(
  ctx: AnyCtx,
  input: ProposeInput,
): Promise<{ id: string; status: 'pending' | 'committed' }> {
  const schema = resolvePendingSchema(input.moduleId, input.targetTable, input.zodSchemaKey)
  const fieldConfidence = input.fieldConfidence ?? {}

  validateConfidence(input.source, fieldConfidence)
  const payload = parseOrThrow(schema, input.payload)

  if ((input.operation === 'insert') !== (input.targetId === undefined)) {
    throw new AppError('validation_failed', 'errors.target_id_mismatch', {
      operation: input.operation,
    })
  }

  const confidenceMin = lowestConfidence(fieldConfidence)

  const { id, rule } = await withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .insert(pendingChanges)
      .values({
        companyId: ctx.companyId,
        moduleId: input.moduleId,
        targetTable: input.targetTable,
        targetId: input.targetId ?? null,
        operation: input.operation,
        payload,
        zodSchemaKey: input.zodSchemaKey,
        fieldConfidence,
        confidenceMin,
        source: input.source,
        sourceDocumentId: input.sourceDocumentId ?? null,
        extractorVersion: input.extractorVersion ?? null,
        model: input.model ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: pendingChanges.id })

    if (!row) throw new Error('pending_changes insert returned nothing')

    return {
      id: row.id,
      rule: await resolveRule(tx, ctx, {
        moduleId: input.moduleId,
        targetTable: input.targetTable,
        operation: input.operation,
      }),
    }
  })

  const clearsFloor =
    rule.autoApprove &&
    rule.minConfidence !== null &&
    confidenceMin !== null &&
    Number(confidenceMin) >= Number(rule.minConfidence)

  if (clearsFloor) {
    await approve(ctx as RequestCtx, { pendingChangeId: id })
    return { id, status: 'committed' }
  }

  return { id, status: 'pending' }
}

/**
 * Approve and commit a draft.
 *
 * One transaction: lock the draft, re-validate, write the target row, write the audit
 * row, emit the outbox event, close the draft. A crash anywhere rolls the whole thing
 * back and the draft stays reviewable.
 */
export async function approve(
  ctx: RequestCtx,
  input: ApproveInput,
): Promise<{ committedRowId: string }> {
  type Failure = { schemaError: AppError }

  const outcome = await withTenantTx(ctx, async (tx): Promise<{ rowId: string } | Failure> => {
    // FOR UPDATE: a concurrent second approve blocks here, then finds the status already
    // moved on and gets a 409. Exactly one commit ever happens.
    const [draft] = await tx
      .select()
      .from(pendingChanges)
      .where(eq(pendingChanges.id, input.pendingChangeId))
      .for('update')

    // Scoped by RLS — a draft belonging to another company is simply not visible.
    if (!draft) throw notFound('errors.pending_change_not_found', { id: input.pendingChangeId })

    if (draft.status !== 'pending') {
      throw conflict('errors.pending_change_not_pending', { id: draft.id, status: draft.status })
    }

    const rule = await resolveRule(tx, ctx, {
      moduleId: draft.moduleId,
      targetTable: draft.targetTable,
      operation: draft.operation,
    })

    if (!rule.requiredRoles.some((role) => ctx.roles.includes(role))) {
      throw new AppError('forbidden', 'errors.not_an_approver', { required: rule.requiredRoles })
    }

    // The reviewer's edits join the payload BEFORE re-validation — a correction must not
    // be able to smuggle past the schema.
    const merged = { ...(draft.payload as Record<string, unknown>), ...(input.corrections ?? {}) }

    let payload: Record<string, unknown>
    try {
      const schema = resolvePendingSchema(draft.moduleId, draft.targetTable, draft.zodSchemaKey)
      payload = parseOrThrow(schema, merged)
    } catch (error) {
      if (!(error instanceof AppError)) throw error
      // Re-validation failed: the schema tightened, or the correction is invalid. Record
      // WHY on the draft and let that record commit, then throw. Rolling back here would
      // discard the only explanation the reviewer is going to get.
      await tx
        .update(pendingChanges)
        .set({
          status: 'failed',
          error: error.toJSON(),
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
          corrections: input.corrections ?? {},
          updatedAt: new Date(),
        })
        .where(eq(pendingChanges.id, draft.id))
      return { schemaError: error }
    }

    const before =
      draft.operation === 'insert'
        ? null
        : await readRow(tx, draft.targetTable, draft.targetId as string)

    if (draft.operation !== 'insert' && !before) {
      throw notFound('errors.target_row_not_found', {
        targetTable: draft.targetTable,
        targetId: draft.targetId,
      })
    }

    const rowId = await applyChange(tx, ctx, {
      operation: draft.operation,
      targetTable: draft.targetTable,
      targetId: draft.targetId,
      payload,
    })

    const after = draft.operation === 'delete' ? null : await readRow(tx, draft.targetTable, rowId)

    await recordChange(ctx, tx, {
      action: draft.operation,
      targetTable: draft.targetTable,
      targetId: rowId,
      before,
      after,
      pendingChangeId: draft.id,
    })

    await emit(ctx, tx, {
      eventName: 'core.pending_change.committed',
      payload: {
        pendingChangeId: draft.id,
        moduleId: draft.moduleId,
        targetTable: draft.targetTable,
        targetId: rowId,
        operation: draft.operation,
        approvedBy: ctx.userId,
      },
      aggregateTable: draft.targetTable,
      aggregateId: rowId,
    })

    await tx
      .update(pendingChanges)
      .set({
        status: 'committed',
        reviewedBy: ctx.userId,
        reviewedAt: new Date(),
        reviewNote: input.note ?? null,
        corrections: input.corrections ?? {},
        committedAt: new Date(),
        committedRowId: rowId,
        updatedAt: new Date(),
      })
      .where(eq(pendingChanges.id, draft.id))

    return { rowId }
  })

  if ('schemaError' in outcome) throw outcome.schemaError
  return { committedRowId: outcome.rowId }
}

/** Reject a draft. No target row is touched; the decision is still audited. */
export async function reject(ctx: RequestCtx, id: string, note?: string): Promise<void> {
  await withTenantTx(ctx, async (tx) => {
    const [draft] = await tx
      .select()
      .from(pendingChanges)
      .where(eq(pendingChanges.id, id))
      .for('update')

    if (!draft) throw notFound('errors.pending_change_not_found', { id })
    if (draft.status !== 'pending') {
      throw conflict('errors.pending_change_not_pending', { id, status: draft.status })
    }

    await tx
      .update(pendingChanges)
      .set({
        status: 'rejected',
        reviewedBy: ctx.userId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(pendingChanges.id, id))

    await recordChange(ctx, tx, {
      action: 'reject',
      targetTable: draft.targetTable,
      targetId: draft.targetId ?? undefined,
      pendingChangeId: draft.id,
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic writes to the target table
//
// A table name held in a string is exactly the shape that invites SQL injection. Four
// independent things stop it here: the module registry whitelist (enforced by
// `resolvePendingSchema` before we ever get here), the CHECK constraint on
// `pending_changes.target_table`, the identifier assertion below, and `sql.identifier`
// quoting. Column names come only from Zod's parsed output, so a payload cannot
// introduce a key the module never declared. Values are always bound parameters.
// ─────────────────────────────────────────────────────────────────────────────

function assertIdentifier(name: string): string {
  if (!IDENTIFIER_RE.test(name)) {
    throw new AppError('validation_failed', 'errors.invalid_identifier', { name })
  }
  return name
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return rows as Record<string, unknown>[]
}

async function readRow(
  tx: TenantDb,
  table: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const result = await tx.execute(
    sql`select * from ${sql.identifier(assertIdentifier(table))} where id = ${id}`,
  )
  return rowsOf(result)[0] ?? null
}

async function applyChange(
  tx: TenantDb,
  ctx: AnyCtx,
  change: {
    operation: Operation
    targetTable: string
    targetId: string | null
    payload: Record<string, unknown>
  },
): Promise<string> {
  const table = sql.identifier(assertIdentifier(change.targetTable))

  if (change.operation === 'delete') {
    const result = await tx.execute(
      sql`delete from ${table} where id = ${change.targetId} returning id`,
    )
    return firstId(result, 'delete')
  }

  if (change.operation === 'update') {
    const assignments = Object.entries(change.payload).map(
      ([column, value]) => sql`${sql.identifier(assertIdentifier(column))} = ${value}`,
    )
    if (assignments.length === 0) {
      throw new AppError('validation_failed', 'errors.empty_update', {})
    }
    const result = await tx.execute(
      sql`update ${table} set ${sql.join(assignments, sql`, `)} where id = ${change.targetId} returning id`,
    )
    return firstId(result, 'update')
  }

  // Insert. company_id comes from ctx, never from the payload — a draft must not be able
  // to name the tenant it lands in, and RLS would reject it anyway.
  const columns = Object.keys(change.payload).map((c) => assertIdentifier(c))
  const result = await tx.execute(sql`
    insert into ${table} (${sql.join(
      [...columns.map((c) => sql.identifier(c)), sql.identifier('company_id')],
      sql`, `,
    )})
    values (${sql.join(
      [...columns.map((c) => sql`${change.payload[c]}`), sql`${ctx.companyId}`],
      sql`, `,
    )})
    returning id
  `)
  return firstId(result, 'insert')
}

function firstId(result: unknown, operation: string): string {
  const row = rowsOf(result)[0]
  if (!row?.id) throw new AppError('internal', 'errors.commit_failed', { operation })
  return String(row.id)
}
