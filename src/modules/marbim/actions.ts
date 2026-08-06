'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { env } from '@/lib/env'
import { requireRole } from '@/modules/core/session'
import { getPolicy } from '@/modules/settings/service'
import { listModules } from '@/modules/core/registry'
import { AppError } from '@/modules/core/errors'
import type { AnyCtx } from '@/modules/core/ctx'
import { buyerAccounts } from '@/modules/buyers/queries'
import { recentAudits } from '@/modules/compliance/queries'

import { intakeKind } from './intake'
import { hasProvider } from './provider'
import { chat, queueExtraction, type ChatResult, type MarbimPolicy } from './service'
import type { ToolPack } from './tools'

/**
 * The MARBIM surface's one write path.
 *
 * `moduleIds` decides which department primers lead the prompt, and it is
 * derived here from the screen the user asked FROM rather than taken from the
 * client. A client that could name its own primers could ask the cutting
 * assistant to answer a payroll question.
 */

/**
 * Everyone the nav offers MARBIM to. Asking a question is a read however it is phrased —
 * MARBIM writes nothing itself, and anything it drafts lands in somebody's approve inbox.
 */
const ASK_ROLES = [
  'merchandiser',
  'commercial',
  'planner',
  'store',
  'procurement',
  'cutting',
  'production',
  'quality',
  'shipment',
  'maintenance',
  'hr',
  'compliance',
  'finance',
  'member',
  'viewer',
] as const

/**
 * Narrower than asking: intake QUEUES an extraction, which costs a provider call and fills
 * somebody's approve inbox with drafts to review (audit AI-H7 — the intake path had no role
 * gate at all, and is not in the nav, so the shell's own check never covered it either).
 * A viewer or a plain member has nothing to draft and no inbox to answer for.
 */
const INTAKE_ROLES = ASK_ROLES.filter(
  (role): role is Exclude<(typeof ASK_ROLES)[number], 'member' | 'viewer'> =>
    role !== 'member' && role !== 'viewer',
)

const askInput = z.object({
  conversationId: z.string().uuid(),
  turnIndex: z.number().int().min(0),
  question: z.string().min(1).max(4000),
  /** The screen MARBIM was opened from. Narrows which primers lead. */
  fromModule: z.string().min(1).max(64).optional(),
})

export async function ask(input: z.input<typeof askInput>): Promise<ChatResult> {
  const ctx = await requireRole(await headers(), ...ASK_ROLES)
  const { conversationId, turnIndex, question, fromModule } = askInput.parse(input)

  // Only modules that actually registered a primer, and only ones this caller's
  // roles can already read — MARBIM never widens what a person can see.
  const registered = listModules()
  const known = new Set(registered.map((m) => m.id))
  const lead = fromModule && known.has(fromModule) ? fromModule : undefined

  const inScope = lead ? registered.filter((m) => m.id === lead) : registered

  // The packs the modules in scope actually registered.
  //
  // This was hardcoded to `[]` with a note saying packs would be wired "as each module
  // lands". Two modules had landed theirs and were still being ignored, so MARBIM answered
  // every question with "no tools are available in this scope" — indistinguishable from a
  // module that had never registered one. A module adding a pack now takes effect by the
  // act of registering it, which is how the rest of the registry already works.
  const packs = inScope
    .map((m) => m.toolPack)
    .filter((pack): pack is ToolPack => isToolPack(pack))

  return chat(ctx, {
    conversationId,
    turnIndex,
    question,
    moduleIds: inScope.map((m) => m.id),
    scope: lead ? { moduleId: lead } : {},
    packs,
  })
}

/**
 * The registry stores `toolPack` as `unknown` — core must not depend on MARBIM's types, or
 * every module would compile against the assistant. So the shape is checked here, at the
 * one place that converts it back. A malformed pack is skipped rather than thrown on: one
 * module's bad registration must not make the assistant unusable for the other twenty.
 */
function isToolPack(value: unknown): value is ToolPack {
  if (typeof value !== 'object' || value === null) return false
  const pack = value as Partial<ToolPack>
  return typeof pack.moduleId === 'string' && Array.isArray(pack.tools)
}

export interface ContextOption {
  id: string
  label: string
  /** Secondary line — what tells two similar rows apart. */
  detail: string
}

/**
 * The choices behind a context picker, read through the owning module (rule 11).
 *
 * One function serves both the screen and the check in `readDocument`, on purpose. Two
 * copies would drift, and the copy that drifted would be the one deciding whether a
 * submitted id is allowed.
 */
async function contextOptions(ctx: AnyCtx, source: 'buyers' | 'audits'): Promise<ContextOption[]> {
  if (source === 'buyers') {
    const rows = await buyerAccounts(ctx)
    return rows.map((buyer) => ({
      id: buyer.id,
      label: buyer.name,
      detail: [buyer.code, buyer.country].filter(Boolean).join(' · '),
    }))
  }

  const rows = await recentAudits(ctx)
  return rows.map((audit) => ({
    id: audit.id,
    label: `${audit.regime} · ${audit.auditor}`,
    // The finding count is the thing that stops a report being filed twice — an audit that
    // already has findings is almost certainly not the one somebody is entering now.
    detail:
      audit.findingCount > 0
        ? `${audit.auditedOn} · ${audit.findingCount} findings already recorded`
        : audit.auditedOn,
  }))
}

/** What the intake screen shows in a kind's pickers. Empty for kinds needing no context. */
export async function intakeContext(
  kindId: string,
): Promise<{ field: string; label: string; options: ContextOption[] }[]> {
  const ctx = await requireRole(await headers(), ...ASK_ROLES)
  const kind = intakeKind(kindId)

  const resolved = []
  for (const field of kind.context ?? []) {
    resolved.push({
      field: field.field,
      label: field.label,
      options: await contextOptions(ctx, field.source),
    })
  }
  return resolved
}

/**
 * Ask MARBIM to read a document somebody has uploaded.
 *
 * The person says what the document IS; the extractor reads it and files a draft. That
 * ordering is deliberate and explained in `intake.ts` — a classifier that guesses wrong puts
 * a draft in an approve inbox where it looks exactly like a right one.
 *
 * Nothing is written to the target table here, or ever, by this path. The extraction lands
 * in `pending_changes` with per-field confidence and waits for a person (CLAUDE.md rule 3).
 * The five-minute `marbim.run_extractions` schedule is what actually runs it, so this
 * returns a queued job rather than a result — a reader who expects a draft immediately would
 * be surprised, and the screen says so.
 *
 * **The TEXT is what gets read; the document is provenance.** `runExtraction` passes
 * `sourceText` to the provider and nothing in this system turns a scan into text — there is
 * no OCR and no PDF parser. Queueing a job with only a `documentId` would extract from an
 * empty string, and the mock provider would then find nothing while the row still said
 * `succeeded`. So text is required and the file is optional, which is the true shape of the
 * capability rather than the one the canvas draws. The document id still travels into
 * `propose`, so an approver can open the original the text was taken from.
 */
export async function readDocument(input: {
  kindId: string
  sourceText: string
  documentId?: string
  contextValues?: Record<string, string>
}): Promise<{ jobId: string; label: string }> {
  const ctx = await requireRole(await headers(), ...INTAKE_ROLES)

  /*
   * Nothing queues into a void (plan 6.1, audit AI-B1).
   *
   * `runQueuedExtractions` skips the whole batch when no provider is registered — correctly,
   * because the backlog is intact and will run when one is configured. What was wrong is
   * what happened before it: this action accepted the document, told the operator it was
   * queued, and left it in a pile nothing would ever read. A person who has typed out a
   * buyer's PO deserves to be told the copilot is not available, at the moment they press
   * the button, rather than to discover it by the draft never arriving.
   *
   * Checked at the door rather than in `queueExtraction`, because the job row is the thing
   * that should not exist — a refusal after the insert would leave exactly the pile this
   * prevents.
   */
  if (!env.MARBIM_ENABLED || !hasProvider()) {
    throw new AppError('validation_failed', 'marbim.errors.unavailable', {
      enabled: env.MARBIM_ENABLED,
      provider: hasProvider(),
    })
  }

  const policy = await getPolicy<MarbimPolicy>(ctx, 'marbim')

  const kind = intakeKind(input.kindId)

  /**
   * Context ids are checked against the caller's OWN options, not merely parsed.
   *
   * These values are merged into the payload and scored 1.0, so an unchecked one would be
   * a way to write a chosen id into a draft wearing full confidence. Re-resolving the list
   * server-side means an id from another company is not in it, and the tenancy-scoped
   * query is what makes that true rather than a check somebody has to remember.
   */
  const contextValues: Record<string, string> = {}
  for (const field of kind.context ?? []) {
    const chosen = input.contextValues?.[field.field]
    if (!chosen) {
      throw new AppError('validation_failed', 'marbim.errors.context_required', {
        field: field.field,
      })
    }

    const options = await contextOptions(ctx, field.source)
    if (!options.some((option) => option.id === chosen)) {
      throw new AppError('validation_failed', 'marbim.errors.context_unknown', {
        field: field.field,
      })
    }

    contextValues[field.field] = chosen
  }

  const { jobId } = await queueExtraction(
    ctx,
    {
      moduleId: kind.moduleId,
      targetTable: kind.targetTable,
      zodSchemaKey: kind.zodSchemaKey,
      extractorName: `intake.${kind.id}`,
      // Versioned so a rewritten extractor's results are never pooled with its
      // predecessor's — the whole reason the field is required.
      extractorVersion: '1',
      sourceText: input.sourceText,
      sourceDocumentId: input.documentId,
      contextValues: Object.keys(contextValues).length > 0 ? contextValues : undefined,
    },
    policy,
  )

  revalidatePath('/approve')

  return { jobId, label: kind.label }
}
