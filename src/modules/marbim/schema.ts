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
