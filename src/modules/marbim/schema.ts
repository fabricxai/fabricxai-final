/**
 * X.2 MARBIM Platform.
 *
 * Two tables, and both exist to answer a question about something a model did.
 *
 *  1. **`extraction_jobs`** — the brief requires extraction to run "as BullMQ jobs (not
 *     in-request) with per-company rate limits; failure states surfaced as retryable job
 *     statuses". A row per attempt, carrying the extractor VERSION, because the correction
 *     rate that decides whether an extractor is trustworthy has to be grouped by something
 *     that changes when the extractor changes.
 *  2. **`chat_turns`** — what was asked, what tools ran, what was said. Kept because a
 *     model that told somebody a wrong number is a thing that has to be reconstructable,
 *     and because the primer versions on the row are what make it reproducible.
 *  3. **`marbim_call_log`** — one row per PROVIDER call, which is not the same as a turn:
 *     an answer that needed three tools is four calls, and the ceiling that stops a runaway
 *     conversation costing a factory a month's software budget has to count what was
 *     actually spent (plan 6.5, audit AI-H4).
 */
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, documents, users } from '@/db/schema/core'

export const modelRoleEnum = pgEnum('model_role', ['extract', 'reason', 'embed'])

export const extractionStatusEnum = pgEnum('extraction_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'rejected',
])

/**
 * One extraction attempt ⚖-adjacent: it does not write money, but what it produces becomes
 * a draft that somebody approves, so the trail matters.
 *
 * `failed` is retryable — a model timeout, a rate limit. `rejected` is not: the input was
 * not something this extractor can read, and retrying it forever is how a queue fills up
 * with the same PDF nobody will ever parse.
 */
export const extractionJobs = pgTable(
  'extraction_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** Which module's schema the result is validated against. */
    moduleId: text('module_id').notNull(),
    targetTable: text('target_table').notNull(),
    zodSchemaKey: text('zod_schema_key').notNull(),

    /** The extractor that ran, and its version. The correction rate groups on this. */
    extractorName: text('extractor_name').notNull(),
    extractorVersion: text('extractor_version').notNull(),
    /** Model id when a model was involved. Null for a deterministic parse. */
    model: text('model'),

    sourceDocumentId: uuid('source_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    /** Free text input when there is no document — an email body, a pasted message. */
    sourceText: text('source_text'),

    /**
     * Fields the PERSON supplied, merged into the payload before validation.
     *
     * Some target schemas require an id no document carries. A buyer's PO names the buyer;
     * `orderFromPoDraft.buyerId` wants the uuid this system uses for them, and the paper
     * has never heard of it. Without this the extraction can only ever fail validation.
     *
     * Kept separate from the extracted values on purpose, and scored 1.0 rather than
     * guessed at: a reviewer must be able to see which fields a model read and which a
     * person chose, because those warrant completely different amounts of suspicion.
     */
    contextValues: jsonb('context_values').$type<Record<string, string>>(),

    status: extractionStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    /** Set when the extraction produced a draft. The link from a job to what it made. */
    pendingChangeId: uuid('pending_change_id'),
    /** Structured failure. `retryable` on it is what separates `failed` from `rejected`. */
    error: jsonb('error').$type<Record<string, unknown>>(),

    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('extraction_jobs_company_status_idx').on(t.companyId, t.status, t.createdAt),
    // The correction-rate report groups by extractor and version.
    index('extraction_jobs_extractor_idx').on(t.companyId, t.extractorName, t.extractorVersion),
    index('extraction_jobs_pending_change_idx').on(t.pendingChangeId),
    // The per-company rate limit counts recent jobs.
    index('extraction_jobs_company_created_idx').on(t.companyId, t.createdAt.desc()),
    check('extraction_jobs_attempts_nonneg', sql`${t.attempts} >= 0`),
    check(
      'extraction_jobs_finished_has_status',
      sql`${t.finishedAt} IS NULL OR ${t.status} IN ('succeeded', 'failed', 'rejected')`,
    ),
  ],
).enableRLS()

/**
 * A conversation turn.
 *
 * `primerVersions` is what makes an answer reproducible: the same question against the same
 * primer versions and the same tool results should produce the same answer, and without the
 * versions "why did it say that last Tuesday" is unanswerable.
 */
export const chatTurns = pgTable(
  'chat_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    conversationId: uuid('conversation_id').notNull(),
    turnIndex: integer('turn_index').notNull(),

    /** What the person asked, after redaction. */
    question: text('question').notNull(),
    answer: text('answer'),
    /** `[{ name, args, ok, ms }]` — which tools ran and whether they worked. */
    toolCalls: jsonb('tool_calls').$type<unknown[]>().notNull().default([]),
    /** Drafts this turn proposed. The link from a sentence to a pending change. */
    proposedChangeIds: uuid('proposed_change_ids').array().notNull().default(sql`'{}'::uuid[]`),

    model: text('model'),
    /** moduleId → primer version. Reproducibility. */
    primerVersions: jsonb('primer_versions').$type<Record<string, string>>().notNull().default({}),
    /** The screen it was asked from. Scopes which primer leads. */
    scope: jsonb('scope').$type<Record<string, unknown>>().notNull().default({}),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chat_turns_conversation_index_key').on(t.conversationId, t.turnIndex),
    index('chat_turns_company_created_idx').on(t.companyId, t.createdAt.desc()),
    index('chat_turns_conversation_idx').on(t.conversationId),
    check('chat_turns_index_nonneg', sql`${t.turnIndex} >= 0`),
  ],
).enableRLS()

/**
 * Every call to a model, and what it cost (plan 6.5, audit AI-H4).
 *
 * ## Why a call and not a turn
 *
 * `chat_turns` records the conversation. This records the SPEND, and they differ by however
 * many tools the model asked for: an answer needing three reads is four provider calls, and
 * a loop that stopped at the iteration cap is five. A ceiling counted per turn would let a
 * tool-heavy conversation cost five times what it appeared to.
 *
 * Extraction and embedding land here too. A factory that uploads two hundred POs in an
 * afternoon has spent real money, and the daily ceiling has to see it — otherwise the budget
 * only governs the cheapest of the three roles.
 *
 * ## Written outside the caller's transaction, deliberately
 *
 * The call already happened and has already been billed by the vendor. Rolling the log row
 * back because a later insert failed would make the ledger disagree with the invoice in the
 * one direction that matters — under-counting — and the ceiling would drift up over time.
 *
 * ## No prompt or answer text
 *
 * `chat_turns` holds those, once, redacted. Duplicating them per call would double the
 * storage of the most sensitive text in the system for no question it answers.
 */
export const marbimCallLog = pgTable(
  'marbim_call_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    role: modelRoleEnum('role').notNull(),
    model: text('model').notNull(),

    /** Present for chat; null for extraction and embedding, which have no conversation. */
    conversationId: uuid('conversation_id'),
    /**
     * Which pass of the execution loop this was. 0 is the first ask; the last is either the
     * turn that answered or the forced answer after the iteration cap.
     */
    iteration: integer('iteration').notNull().default(0),

    /**
     * As the vendor reported them. Null when a call failed before returning usage — the row
     * still exists, because "we were billed for something that errored" is a real state and
     * a missing row would read as a call that never happened.
     */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    durationMs: integer('duration_ms').notNull(),

    /** `ok`, or the ProviderError's message. Truncated by the writer. */
    outcome: text('outcome').notNull(),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The ceiling query: this company's spend since a cutoff. Covers the only read there is.
    index('marbim_call_log_company_created_idx').on(t.companyId, t.createdAt.desc()),
    index('marbim_call_log_conversation_idx').on(t.conversationId),
    check('marbim_call_log_iteration_nonneg', sql`${t.iteration} >= 0`),
    check(
      'marbim_call_log_tokens_nonneg',
      sql`(${t.inputTokens} IS NULL OR ${t.inputTokens} >= 0) AND (${t.outputTokens} IS NULL OR ${t.outputTokens} >= 0)`,
    ),
  ],
).enableRLS()
