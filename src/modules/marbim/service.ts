/**
 * X.2 MARBIM Platform — service layer.
 *
 * The module that lets a model write to an ERP. Everything it produces goes through
 * `pending_changes` (rule 3), so the job here is not "let the model do things" — it is to
 * make what the model proposed reviewable: with real per-field confidence, with the evidence
 * it read, with the extractor version that produced it, and with a prompt somebody can
 * reproduce.
 *
 * Extraction runs as a JOB, never in a request. The brief requires it, and the reason is
 * plain: a model call is seconds of latency with a real failure rate, and a merchandiser
 * uploading a tech pack should not be watching a spinner that might end in a 504.
 */
import { and, count, desc, eq, gte, sql } from 'drizzle-orm'

import type { AnyCtx, RequestCtx } from '../core/ctx'
import { AppError, conflict, notFound } from '../core/errors'
import { propose } from '../core/pending-changes'
import { getModule, resolvePendingSchema } from '../core/registry'
import { withTenantRead, withTenantTx } from '../core/tenancy'

import { MARBIM_EVENTS } from './events'
import {
  assembleSystemPrompt,
  assertExtractionConfidence,
  MarbimError,
  redactForPrompt,
  type AssembledPrompt,
  type PrimerFragment,
  type PromptScope,
} from './marbim'
import { getProvider, ProviderError } from './provider'
import { chatTurns, extractionJobs } from './schema'
import { collectTools, validateToolPack, type ModuleTool, type ToolPack } from './tools'
import { extractionRequest } from './zod'

/** Company policy. Read from X.3 Settings by the caller, like every other module's. */
export interface MarbimPolicy {
  /** Extractions a company may start per hour. A model bill is a real cost. */
  extractionsPerHour: number
  /** Attempts before a retryable failure stops being retried. */
  maxAttempts: number
}

/**
 * What to record on a failed job.
 *
 * An `AppError`'s `message` is only `kind: messageKey` — the thing that actually says WHY is
 * in `details.reason`. Storing just the key would leave whoever opens a rejected job reading
 * "validation_failed: marbim.errors.invalid", which tells them nothing they did not already
 * know from the status column.
 */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  if (error instanceof AppError && typeof error.details.reason === 'string') {
    return `${error.message} — ${error.details.reason}`
  }
  return error.message
}

function wrapMarbimError<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof MarbimError) {
      throw new AppError('validation_failed', 'marbim.errors.invalid', { reason: error.message })
    }
    throw error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gather the primers of every registered module.
 *
 * Read from the registry rather than a list here, so a module that ships a primer is
 * automatically part of MARBIM's knowledge and one that does not is automatically absent.
 * A hand-maintained list would drift the first time somebody added a module on a Friday.
 */
export function collectPrimers(moduleIds: readonly string[]): PrimerFragment[] {
  const primers: PrimerFragment[] = []

  for (const moduleId of moduleIds) {
    const definition = getModule(moduleId)

    if (!definition) {
      // Refused, not skipped. A module that is not loaded produces no primer, and silently
      // omitting it would have MARBIM answer a costing question without the costing craft
      // while looking exactly as confident as if it had it.
      throw new AppError('validation_failed', 'marbim.errors.unknown_module', { moduleId })
    }

    // Registered but with no primer is fine — not every module has craft to teach.
    if (!definition.domainPrimer) continue

    primers.push({
      moduleId,
      version: definition.domainPrimer.version,
      text: definition.domainPrimer.text,
    })
  }

  return primers
}

export function buildPrompt(input: {
  moduleIds: readonly string[]
  scope: PromptScope
}): AssembledPrompt {
  return wrapMarbimError(() =>
    assembleSystemPrompt({ primers: collectPrimers(input.moduleIds), scope: input.scope }),
  )
}

/** Every tool in scope, validated against what each module actually registered. */
export function toolsInScope(packs: readonly ToolPack[]): ModuleTool[] {
  for (const pack of packs) {
    const definition = getModule(pack.moduleId)
    if (!definition) {
      throw new AppError('validation_failed', 'marbim.errors.unknown_module', {
        moduleId: pack.moduleId,
      })
    }
    validateToolPack(pack, { pendingTargets: definition.pendingTargets })
  }
  return collectTools(packs)
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface QueuedExtraction {
  jobId: string
  status: 'queued'
}

/**
 * Queue an extraction (brief: "runs as BullMQ jobs, not in-request, with per-company rate
 * limits").
 *
 * The rate limit is checked here rather than in the worker so a caller finds out immediately
 * that they are over it, instead of queueing a hundred jobs that fail one at a time. A model
 * bill is a real cost and a runaway loop is a real way to incur one.
 */
export async function queueExtraction(
  ctx: RequestCtx,
  input: unknown,
  policy: MarbimPolicy,
): Promise<QueuedExtraction> {
  const payload = extractionRequest.parse(input)

  const definition = getModule(payload.moduleId)
  if (!definition) {
    throw new AppError('validation_failed', 'marbim.errors.unknown_module', {
      moduleId: payload.moduleId,
    })
  }
  if (!definition.pendingTargets.includes(payload.targetTable)) {
    // The registry whitelist, checked at queue time. `propose` would refuse it later
    // anyway; refusing now means the mistake is found by the person who made it.
    throw new AppError('validation_failed', 'marbim.errors.target_not_registered', {
      moduleId: payload.moduleId,
      targetTable: payload.targetTable,
    })
  }

  return withTenantTx(ctx, async (tx) => {
    const since = new Date(Date.now() - 3_600_000)
    const [recent] = await tx
      .select({ n: count() })
      .from(extractionJobs)
      .where(gte(extractionJobs.createdAt, since))

    if ((recent?.n ?? 0) >= policy.extractionsPerHour) {
      throw new AppError('rate_limited', 'marbim.errors.rate_limited', {
        limit: policy.extractionsPerHour,
        windowHours: 1,
      })
    }

    const [row] = await tx
      .insert(extractionJobs)
      .values({
        companyId: ctx.companyId,
        moduleId: payload.moduleId,
        targetTable: payload.targetTable,
        zodSchemaKey: payload.zodSchemaKey,
        extractorName: payload.extractorName,
        extractorVersion: payload.extractorVersion,
        sourceDocumentId: payload.sourceDocumentId ?? null,
        // Redacted at the door, not at the model call: whatever is stored here is read by
        // people too.
        sourceText: payload.sourceText ? redactForPrompt(payload.sourceText) : null,
        createdBy: ctx.userId,
      })
      .returning({ id: extractionJobs.id })

    if (!row) throw new Error('extraction_jobs insert returned nothing')

    await tx.execute(sql`select 1`)

    return { jobId: row.id, status: 'queued' as const }
  })
}

export interface ExtractionOutcome {
  jobId: string
  status: 'succeeded' | 'failed' | 'rejected'
  pendingChangeId?: string
  error?: string
}

/**
 * Run a queued extraction. Called by the worker, never in a request.
 *
 * The confidence check is the load-bearing line. A provider that returns a constant is
 * refused HERE, before the draft exists — which is why the mock provider produces genuinely
 * varying scores rather than a fixed number that would sail past it.
 *
 * `failed` and `rejected` are different on purpose. A timeout is retryable; a PDF this
 * extractor cannot read is not, and retrying it forever fills a queue with one document
 * nobody will ever parse.
 */
export async function runExtraction(
  ctx: AnyCtx,
  input: { jobId: string },
  policy: MarbimPolicy,
): Promise<ExtractionOutcome> {
  const job = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx.select().from(extractionJobs).where(eq(extractionJobs.id, input.jobId))
    return row
  })

  if (!job) throw notFound('marbim.errors.job_not_found', { jobId: input.jobId })
  if (job.status === 'succeeded') {
    // Already done. A redelivered job must not produce a second draft of the same document.
    return { jobId: job.id, status: 'succeeded', pendingChangeId: job.pendingChangeId ?? undefined }
  }
  if (job.status === 'rejected') {
    throw conflict('marbim.errors.job_rejected', { jobId: job.id })
  }

  await withTenantTx(ctx, async (tx) => {
    await tx
      .update(extractionJobs)
      .set({
        status: 'running',
        attempts: job.attempts + 1,
        startedAt: new Date(),
        // Cleared, not left behind. A retry of a failed job carries that attempt's
        // `finished_at` and error otherwise — the row would claim to be both running and
        // finished, which the table's own check constraint refuses outright.
        finishedAt: null,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(extractionJobs.id, job.id))
  })

  try {
    const schema = resolvePendingSchema(job.moduleId, job.targetTable, job.zodSchemaKey)
    const source = job.sourceText ?? ''

    const result = await getProvider().extract({
      role: 'extract',
      schema,
      input: source,
      instruction: `Extract a ${job.targetTable} record for the ${job.moduleId} module.`,
    })

    // The check the whole module exists for. A constant is refused before it becomes a
    // draft that looks reviewed.
    wrapMarbimError(() =>
      assertExtractionConfidence({
        payload: result.value as Record<string, unknown>,
        fieldConfidence: result.fieldConfidence,
        method: result.method,
        uniformConfidenceJustification: result.uniformConfidenceJustification,
      }),
    )

    const proposed = await propose(ctx, {
      moduleId: job.moduleId,
      targetTable: job.targetTable,
      operation: 'insert',
      payload: result.value as Record<string, unknown>,
      zodSchemaKey: job.zodSchemaKey,
      fieldConfidence: result.fieldConfidence,
      source: 'ai_extraction',
      sourceDocumentId: job.sourceDocumentId ?? undefined,
      extractorVersion: job.extractorVersion,
      model: result.model,
    })

    return await withTenantTx(ctx, async (tx) => {
      await tx
        .update(extractionJobs)
        .set({
          status: 'succeeded',
          pendingChangeId: proposed.id,
          model: result.model,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(extractionJobs.id, job.id))

      return { jobId: job.id, status: 'succeeded' as const, pendingChangeId: proposed.id }
    })
  } catch (error) {
    // Retryable only while attempts remain. A provider timeout deserves another go; a
    // document this extractor cannot read does not, and neither does an attempt count that
    // has run out.
    const retryable =
      error instanceof ProviderError ? error.retryable : !(error instanceof AppError)
    const exhausted = job.attempts + 1 >= policy.maxAttempts
    const status = retryable && !exhausted ? ('failed' as const) : ('rejected' as const)

    await withTenantTx(ctx, async (tx) => {
      await tx
        .update(extractionJobs)
        .set({
          status,
          error: {
            message: describeFailure(error),
            retryable,
            attempts: job.attempts + 1,
          },
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(extractionJobs.id, job.id))
    })

    return { jobId: job.id, status, error: describeFailure(error) }
  }
}

/** Jobs a worker should pick up: queued, or failed with attempts left. */
export async function retryableJobs(
  ctx: AnyCtx,
  policy: MarbimPolicy,
): Promise<(typeof extractionJobs.$inferSelect)[]> {
  return withTenantRead(ctx, async (tx) =>
    tx
      .select()
      .from(extractionJobs)
      .where(
        sql`(${extractionJobs.status} = 'queued')
            or (${extractionJobs.status} = 'failed' and ${extractionJobs.attempts} < ${policy.maxAttempts})`,
      )
      .orderBy(extractionJobs.createdAt),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Correction telemetry
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractorScore {
  extractorName: string
  extractorVersion: string
  drafted: number
  reviewed: number
  corrected: number
  /** Null when nothing has been reviewed. Never 0 — see below. */
  correctionRatePct: string | null
}

/**
 * How often an extractor's drafts get edited before approval (brief: "correction telemetry:
 * field-level edits on drafts logged → correction-rate per extractor version").
 *
 * Grouped by extractor AND version, which is the whole point: an extractor that improved
 * should not carry the correction rate of the version it replaced, and one that regressed
 * should not hide behind its predecessor's record.
 *
 * Null rather than zero when nothing has been reviewed. A brand-new extractor with a 0%
 * correction rate would rank as the most trustworthy thing in the system on the strength of
 * never having been checked.
 */
export async function extractorScores(ctx: AnyCtx): Promise<ExtractorScore[]> {
  const { pendingChanges } = await import('@/db/schema/core')

  return withTenantRead(ctx, async (tx) => {
    const rows = await tx
      .select({
        extractorName: extractionJobs.extractorName,
        extractorVersion: extractionJobs.extractorVersion,
        status: pendingChanges.status,
        reviewedBy: pendingChanges.reviewedBy,
        corrections: pendingChanges.corrections,
      })
      .from(extractionJobs)
      .leftJoin(pendingChanges, eq(extractionJobs.pendingChangeId, pendingChanges.id))
      .where(eq(extractionJobs.status, 'succeeded'))

    const byExtractor = new Map<string, ExtractorScore>()

    for (const row of rows) {
      const key = `${row.extractorName}@${row.extractorVersion}`
      const entry = byExtractor.get(key) ?? {
        extractorName: row.extractorName,
        extractorVersion: row.extractorVersion,
        drafted: 0,
        reviewed: 0,
        corrected: 0,
        correctionRatePct: null,
      }

      entry.drafted += 1

      // Only a HUMAN review says anything about whether the extraction was right. An
      // auto-approved draft never met a reviewer.
      if (row.status && row.status !== 'pending' && row.reviewedBy) {
        entry.reviewed += 1
        if (row.corrections && Object.keys(row.corrections).length > 0) entry.corrected += 1
      }

      byExtractor.set(key, entry)
    }

    return [...byExtractor.values()]
      .map((entry) => ({
        ...entry,
        correctionRatePct:
          entry.reviewed === 0
            ? null
            : ((entry.corrected * 10000) / entry.reviewed / 100).toFixed(2),
      }))
      // Worst first — the extractor most in need of attention.
      .sort((a, b) => Number(b.correctionRatePct ?? -1) - Number(a.correctionRatePct ?? -1))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatResult {
  turnId: string
  answer: string
  toolCalls: { name: string; args: Record<string, unknown> }[]
  primerVersions: Record<string, string>
}

/**
 * One conversation turn.
 *
 * Records the primer versions on the row, which is what makes an answer reproducible. The
 * question is redacted before it is stored or sent — a connection string pasted into a chat
 * box is the realistic accident, and it would otherwise live in the database forever.
 */
export async function chat(
  ctx: RequestCtx,
  input: {
    conversationId: string
    turnIndex: number
    question: string
    moduleIds: readonly string[]
    scope?: PromptScope
    packs?: readonly ToolPack[]
  },
): Promise<ChatResult> {
  const question = redactForPrompt(input.question)
  const prompt = buildPrompt({ moduleIds: input.moduleIds, scope: input.scope ?? {} })
  const tools = input.packs ? toolsInScope(input.packs) : []

  const result = await getProvider().generate({
    role: 'reason',
    system: prompt.text,
    messages: [{ role: 'user', content: question }],
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
  })

  return withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .insert(chatTurns)
      .values({
        companyId: ctx.companyId,
        conversationId: input.conversationId,
        turnIndex: input.turnIndex,
        question,
        answer: result.text,
        toolCalls: result.toolCalls,
        model: result.model,
        primerVersions: prompt.primerVersions,
        scope: (input.scope ?? {}) as Record<string, unknown>,
        createdBy: ctx.userId,
      })
      .returning({ id: chatTurns.id })

    if (!row) throw new Error('chat_turns insert returned nothing')

    return {
      turnId: row.id,
      answer: result.text,
      toolCalls: result.toolCalls,
      primerVersions: prompt.primerVersions,
    }
  })
}

/** A conversation, oldest turn first. */
export async function conversation(
  ctx: AnyCtx,
  conversationId: string,
): Promise<(typeof chatTurns.$inferSelect)[]> {
  return withTenantRead(ctx, async (tx) =>
    tx
      .select()
      .from(chatTurns)
      .where(eq(chatTurns.conversationId, conversationId))
      .orderBy(chatTurns.turnIndex),
  )
}

/** Recent extraction jobs, newest first — the admin runbook screen. */
export async function recentJobs(
  ctx: AnyCtx,
  input: { limit?: number } = {},
): Promise<(typeof extractionJobs.$inferSelect)[]> {
  return withTenantRead(ctx, async (tx) =>
    tx
      .select()
      .from(extractionJobs)
      .orderBy(desc(extractionJobs.createdAt))
      .limit(Math.min(input.limit ?? 50, 200)),
  )
}

export { and, conflict, MARBIM_EVENTS }
