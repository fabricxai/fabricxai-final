/**
 * Read models for the Approve Inbox screens.
 *
 * `service.inbox()` already returns the routing decision — which drafts this
 * reviewer may sign, and how close each is to escalating. This file adds only
 * what the SCREEN needs on top of that: a human title, the order the draft
 * belongs to, and the field-level diff a reviewer reads before signing.
 *
 * Nothing here writes. The screen's two write paths are in `actions.ts`.
 */
import { and, eq, gte, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { pendingChanges } from '@/db/schema/core'
import type { AnyCtx } from '@/modules/core/ctx'
import { readJsonbObject } from '@/modules/core/jsonb'
import { withTenantRead } from '@/modules/core/tenancy'

/**
 * `pending_changes.field_confidence`: field name → the extractor's confidence.
 *
 * Empty is meaningful and legal — it means a human wrote the draft. Confidence
 * outside 0–1 is not: it would sort a draft to the top or bottom of the inbox
 * on a number that means nothing, so the map is rejected rather than trusted.
 */
const fieldConfidenceSchema = z.record(z.string().min(1), z.number().min(0).max(1))

import { inbox, type ApprovalsPolicy, type InboxItem } from './service'

/** A draft as the inbox list renders it. */
export interface InboxRow extends InboxItem {
  /** Human sentence for the row — "Breakdown edit · +2,000 pcs Navy/L". */
  title: string
  /** The order or document this draft hangs off, when the payload names one. */
  reference: string | null
  /**
   * Whether a human or a model produced this. The screen filters on it because
   * the two get read differently: a model draft is checked against its sources,
   * a human draft against its author's authority.
   */
  fromModel: boolean
  /** Past the policy's escalation window and still waiting. */
  aging: boolean
}

/**
 * Titles are derived, not stored.
 *
 * A stored title would be written once at propose time and then drift from the
 * payload it describes — and the payload is the thing being approved. Deriving
 * means the row always describes what is actually about to be committed.
 */
function titleFor(draft: {
  operation: string
  targetTable: string
  payload: Record<string, unknown>
}): string {
  const table = draft.targetTable.replace(/_/g, ' ')
  const verb =
    draft.operation === 'insert' ? 'New' : draft.operation === 'delete' ? 'Remove' : 'Edit'
  return `${verb} · ${table}`
}

const REFERENCE_KEYS = ['buyer_po_no', 'buyerPoNo', 'po_number', 'poNumber', 'order_id', 'orderId']

function referenceFor(payload: Record<string, unknown>): string | null {
  for (const key of REFERENCE_KEYS) {
    const v = payload[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

export async function inboxRows(
  ctx: AnyCtx,
  input: { now: Date; moduleId?: string; limit?: number },
  policy: ApprovalsPolicy,
): Promise<InboxRow[]> {
  const items = await inbox(ctx, input, policy)
  if (items.length === 0) return []

  // One extra read for the payloads the list needs to describe itself.
  const drafts = await withTenantRead(ctx, (tx) =>
    tx
      .select({
        id: pendingChanges.id,
        payload: pendingChanges.payload,
        operation: pendingChanges.operation,
        targetTable: pendingChanges.targetTable,
      })
      .from(pendingChanges)
      .where(
        inArray(
          pendingChanges.id,
          items.map((i) => i.id),
        ),
      ),
  )

  const byId = new Map(drafts.map((d) => [d.id, d]))

  return items.map((item) => {
    const draft = byId.get(item.id)
    const payload = draft?.payload ?? {}
    return {
      ...item,
      title: draft ? titleFor(draft) : item.targetTable,
      reference: referenceFor(payload),
      // Only the two ai_* sources carry per-field confidence. `import` and
      // `integration` are machine-made but have no extractor behind them, so
      // grouping them with model drafts would promise a confidence the screen
      // then has nothing to show for.
      fromModel: item.source === 'ai_extraction' || item.source === 'ai_chat',
      aging: item.ageHours >= policy.agingEscalateAfterHours,
    }
  })
}

/** One changed field, as the diff panel renders it. */
export interface FieldDiff {
  field: string
  before: unknown
  after: unknown
  /** Straight from the extractor. Null for human drafts — absence, not a fake 1.0. */
  confidence: number | null
  changed: boolean
}

export interface DraftDetail {
  id: string
  moduleId: string
  targetTable: string
  targetId: string | null
  operation: string
  source: string
  sourceDocumentId: string | null
  extractorVersion: string | null
  model: string | null
  createdAt: Date
  payload: Record<string, unknown>
  fields: FieldDiff[]
}

/**
 * The draft, field by field.
 *
 * `before` is supplied by the caller rather than read here, because only the
 * owning module knows how to fetch the current row for its own target table —
 * reading it generically would mean this file naming every table in the system.
 */
export async function draftDetail(
  ctx: AnyCtx,
  pendingChangeId: string,
  before: Record<string, unknown> | null,
): Promise<DraftDetail | null> {
  const row = await withTenantRead(ctx, async (tx) => {
    const [d] = await tx
      .select()
      .from(pendingChanges)
      .where(and(eq(pendingChanges.id, pendingChangeId), eq(pendingChanges.status, 'pending')))
    return d ?? null
  })

  if (!row) return null

  // null here means the stored map was malformed, which is NOT the same as a
  // human draft's empty map — so every field reports "no confidence" rather
  // than borrowing a number from a map we could not read.
  const confidence = readJsonbObject(
    fieldConfidenceSchema,
    row.fieldConfidence,
    'pending_changes.field_confidence',
  )

  const fields: FieldDiff[] = Object.entries(row.payload).map(([field, after]) => {
    const prior = before ? before[field] : undefined
    return {
      field,
      before: prior,
      after,
      confidence: confidence?.[field] ?? null,
      // An unchanged field still renders, greyed — a reviewer needs to see what
      // the draft leaves alone as much as what it moves.
      changed: before === null || JSON.stringify(prior) !== JSON.stringify(after),
    }
  })

  return {
    id: row.id,
    moduleId: row.moduleId,
    targetTable: row.targetTable,
    targetId: row.targetId,
    operation: row.operation,
    source: row.source,
    sourceDocumentId: row.sourceDocumentId,
    extractorVersion: row.extractorVersion,
    model: row.model,
    createdAt: row.createdAt,
    payload: row.payload,
    fields,
  }
}

/**
 * The trust footer's three numbers (X.2 canvas, P4).
 *
 * The point of publishing these is that the correction rate is the honest one — a
 * merchandiser who knows MARBIM gets the size ratio wrong one time in five checks that
 * field and trusts the other eight. Hiding it buys a trust that the first bad draft spends.
 *
 * Counted from `pending_changes`, so it is what actually happened in this tenant rather
 * than a figure typed into a design. `corrected` counts FIELDS a reviewer changed before
 * approving, not drafts — one draft corrected in three places is three corrections, which
 * is what a per-field rate needs.
 *
 * A new factory sees zeroes. That is the correct answer and the panel says so, rather than
 * borrowing somebody else's numbers to look established.
 */
export interface MarbimTrust {
  drafted: number
  approved: number
  correctedFields: number
  /** Still waiting — what the FAB's count badge shows. */
  pending: number
  /** How far back the numbers reach. */
  windowDays: number
}

export async function marbimTrust(ctx: AnyCtx, windowDays = 90): Promise<MarbimTrust> {
  const since = new Date(Date.now() - windowDays * 86_400_000)

  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        status: pendingChanges.status,
        corrections: pendingChanges.corrections,
      })
      .from(pendingChanges)
      .where(
        and(
          eq(pendingChanges.companyId, ctx.companyId),
          gte(pendingChanges.createdAt, since),
          // Only what a model drafted. A row a person typed is not evidence about MARBIM.
          inArray(pendingChanges.source, ['ai_extraction', 'ai_chat']),
        ),
      )

    let approved = 0
    let pending = 0
    let correctedFields = 0

    for (const row of rows) {
      if (row.status === 'committed') approved += 1
      if (row.status === 'pending') pending += 1
      // Shape only — the values are whatever the reviewer typed, and this counts keys.
      const corrections = readJsonbObject(
        z.record(z.string().min(1), z.unknown()),
        row.corrections,
        'approvals.marbimTrust.corrections',
      )
      correctedFields += corrections ? Object.keys(corrections).length : 0
    }

    return { drafted: rows.length, approved, pending, correctedFields, windowDays }
  })
}

/**
 * How many drafts are waiting on THIS reviewer — the FAB's count badge.
 *
 * Deliberately routed through `inbox()`, the same call the approve screen renders from,
 * rather than a cheaper `count(*)` over pending rows. A count that is not role-routed says
 * "4 waiting" to a storekeeper whose inbox reads "Nothing routed to you" — a badge that
 * can never be cleared, on every screen, which is how people learn to stop reading badges.
 *
 * Two queries per page render buys the badge and the inbox agreeing by construction, and
 * they cannot drift because there is only one routing rule.
 */
export async function routedPendingCount(
  ctx: AnyCtx,
  policy: ApprovalsPolicy,
  now = new Date(),
): Promise<number> {
  const items = await inbox(ctx, { now }, policy)
  return items.length
}

/**
 * Which row a draft points at, so its prior state can be read.
 *
 * Separate from `draftDetail` because the caller has to fetch the before BETWEEN knowing
 * the target and building the diff, and `draftDetail` takes the before as an argument by
 * design — it does not read tables it does not own.
 */
export async function draftTarget(
  ctx: AnyCtx,
  pendingChangeId: string,
): Promise<{ targetTable: string; targetId: string | null } | null> {
  return withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({
        targetTable: pendingChanges.targetTable,
        targetId: pendingChanges.targetId,
      })
      .from(pendingChanges)
      .where(and(eq(pendingChanges.id, pendingChangeId), eq(pendingChanges.status, 'pending')))

    return row ?? null
  })
}
