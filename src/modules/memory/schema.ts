/**
 * 1.6 Order Memory.
 *
 * Two tables, holding the two halves of "what happened last time".
 *
 *  1. **`style_fingerprints`** — one embedding per style code, so "find me the orders like
 *     this one" is a vector search rather than a merchandiser's recollection of which buyer
 *     ordered something similar in 2024.
 *  2. **`order_outcomes`** — the compiled record of a closed order: what it actually
 *     consumed, the efficiency it ran at, what went wrong, which milestones slipped, and
 *     the margin it really made against the one that was quoted.
 *
 * The outcome is deliberately a SNAPSHOT and not a view. The rows it is assembled from are
 * live — an efficiency figure gets recomputed, a defect gets recoded, a cost gets a late
 * correction — and a "memory" that silently changed under the person reading it would be
 * worse than none. Compiled once, on close, and then immutable except for the note.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

import { companies, users } from '@/db/schema/core'
import { orders } from '@/modules/orders/schema'

/**
 * One row per style code per company.
 *
 * `sourceHash` is the fingerprint text's hash. Re-embedding costs a model call, and a style
 * whose attributes did not change does not need one — but the check has to be on the text
 * that was actually embedded, not on an `updated_at`, because that is the only thing that
 * determines the vector.
 *
 * `model` is stored beside the vector on purpose. Two embeddings from different models are
 * not comparable, and a search that mixed them would return confident nonsense; `findSimilar`
 * filters on it rather than assuming a company has only ever used one.
 */
export const styleFingerprints = pgTable(
  'style_fingerprints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    styleCode: text('style_code').notNull(),
    /** product_type, gsm, construction, gauge… — what the fingerprint text is built from. */
    attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),

    /** 1536 dims. `EMBEDDING_DIM` in memory.ts is checked against this before every write. */
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    /** Which model produced it. Vectors from two models are not comparable. */
    model: text('model').notNull(),
    /** Hash of the exact text embedded — the only honest "does this need redoing" test. */
    sourceHash: text('source_hash').notNull(),

    embeddedAt: timestamp('embedded_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('style_fingerprints_company_style_key').on(t.companyId, t.styleCode),
    // HNSW on cosine — the operator `findSimilar` uses. Built across companies because a
    // per-company partial index per tenant does not scale; RLS plus the explicit
    // `company_id` predicate keep the result set right, and the index only orders it.
    index('style_fingerprints_embedding_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
    index('style_fingerprints_company_model_idx').on(t.companyId, t.model),
  ],
).enableRLS()

/**
 * The compiled record of one closed order.
 *
 * Every jsonb column here is a frozen computation, and each carries enough context to be
 * read years later without the tables it came from:
 *
 *  - `actualConsumptionPc` — `[{ itemRef, uom, issued, perPiece, piecesProduced }]`. The
 *    denominator travels with the figure, because "1.47 m" means nothing without knowing it
 *    was over 12,000 pieces and not over the 400 that were cut before the order was pulled.
 *  - `efficiencyCurve` — `[{ date, lineId, efficiencyPct, sharedWithOtherOrders }]`. The
 *    flag is the honest part: a day the line ran two orders is reported, never apportioned.
 *  - `topDefects` — `[{ code, count, pctOfDefects }]`.
 *  - `delayEvents` — `[{ milestone, days, direction }]`.
 *
 * `compiledSources` records which of those four inputs actually had data. An order closed
 * before 6.1 was in use has no efficiency curve, and an empty array must not be readable as
 * "this order ran with no defects".
 */
export const orderOutcomes = pgTable(
  'order_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    compiledAt: timestamp('compiled_at', { withTimezone: true }).notNull().defaultNow(),

    actualConsumptionPc: jsonb('actual_consumption_pc').$type<unknown[]>().notNull().default([]),
    efficiencyCurve: jsonb('efficiency_curve').$type<unknown[]>().notNull().default([]),
    topDefects: jsonb('top_defects').$type<unknown[]>().notNull().default([]),
    delayEvents: jsonb('delay_events').$type<unknown[]>().notNull().default([]),

    /** Which inputs were present. An absent source is not the same as a clean result. */
    compiledSources: jsonb('compiled_sources')
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),

    /**
     * Both margins or neither, and both on the same basis — margin on price and margin on
     * cost differ by several points, and a memory that mixed them would teach the factory
     * the wrong lesson about its own pricing.
     */
    quotedMarginPct: numeric('quoted_margin_pct', { precision: 7, scale: 2 }),
    actualMarginPct: numeric('actual_margin_pct', { precision: 7, scale: 2 }),
    marginBasis: text('margin_basis'),

    /** Pieces the order actually shipped — the denominator behind the consumption figures. */
    piecesProduced: integer('pieces_produced').notNull().default(0),

    /** The merchandiser's own account. The only editable field, for seven days. */
    merchandiserNote: text('merchandiser_note'),
    noteUpdatedAt: timestamp('note_updated_at', { withTimezone: true }),
    noteUpdatedBy: text('note_updated_by').references(() => users.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One outcome per order. A second compilation updates this row rather than adding a
    // competing account of the same order.
    uniqueIndex('order_outcomes_order_key').on(t.orderId),
    index('order_outcomes_company_compiled_idx').on(t.companyId, t.compiledAt.desc()),
    check('order_outcomes_pieces_nonneg', sql`${t.piecesProduced} >= 0`),
    check(
      'order_outcomes_margin_basis',
      sql`${t.marginBasis} IS NULL OR ${t.marginBasis} IN ('price', 'cost')`,
    ),
    // Both margins or neither. One alone is a comparison with a missing half, and a screen
    // showing "actual 12%" beside a blank quoted figure invites exactly the wrong reading.
    check(
      'order_outcomes_margins_paired',
      sql`(${t.quotedMarginPct} IS NULL) = (${t.actualMarginPct} IS NULL)
          AND (${t.quotedMarginPct} IS NULL) = (${t.marginBasis} IS NULL)`,
    ),
  ],
).enableRLS()
