/**
 * 1.2 RFQ & Quotation.
 *
 * Where an enquiry becomes a price. Two decisions run through this schema:
 *
 *  1. **`quotes.fob_breakdown` is a SNAPSHOT, not a pointer.** `cost_sheet_id` records
 *     which sheet it came from, but the numbers are frozen on the quote — the sheet gets
 *     repriced and the quote the buyer holds does not change. A breakdown that recomputed
 *     would be a quote nobody can reproduce when the buyer asks why the price moved.
 *  2. **Quotes are versioned and superseded, never edited.** Version 2 is a re-quote;
 *     version 1 is what somebody was told last week and may still be acting on.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, documents, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { costSheets } from '@/modules/costing/schema'

export const rfqStatusEnum = pgEnum('rfq_status', [
  'open',
  'clarifying',
  'quoted',
  'won',
  'lost',
  'cancelled',
])
export const rfqSourceEnum = pgEnum('rfq_source', ['manual', 'ai_extracted'])
export const quoteStatusEnum = pgEnum('quote_status', ['draft', 'sent', 'superseded'])

/** The seeded loss taxonomy. Why buyers went elsewhere is the desk's most valuable output. */
export const lossReasons = pgTable(
  'loss_reasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    code: text('code').notNull(),
    label: text('label').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('loss_reasons_company_code_key').on(t.companyId, t.code)],
).enableRLS()

export const rfqs = pgTable(
  'rfqs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id, { onDelete: 'restrict' }),

    title: text('title').notNull(),
    productType: text('product_type').notNull(),
    description: text('description'),
    styleCode: text('style_code'),

    quantity: integer('quantity').notNull(),
    unit: text('unit').notNull().default('pcs'),
    /** size → parts. 5.1 cannot cut without it, so a win requires it. */
    sizeRatio: jsonb('size_ratio').$type<Record<string, number>>().notNull().default({}),

    /** What the buyer says they want to pay, in THEIR currency — often not the quote's. */
    targetPrice: numeric('target_price', { precision: 14, scale: 4 }),
    targetCurrency: text('target_currency'),
    currency: text('currency').notNull().default('USD'),

    deadline: date('deadline'),
    requestedShipDate: date('requested_ship_date'),

    status: rfqStatusEnum('status').notNull().default('open'),
    source: rfqSourceEnum('source').notNull().default('manual'),
    /** Required when status is `lost` — enforced by the service and the check below. */
    lossReasonCode: text('loss_reason_code'),

    /** Which merchandiser owns it. Role scoping reads this. */
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rfqs_company_status_idx').on(t.companyId, t.status, t.deadline),
    index('rfqs_company_buyer_idx').on(t.companyId, t.buyerId),
    // The deadline-near scan.
    index('rfqs_company_deadline_idx').on(t.companyId, t.deadline),
    index('rfqs_company_owner_idx').on(t.companyId, t.ownerUserId, t.status),
    check('rfqs_quantity_positive', sql`${t.quantity} > 0`),
    check('rfqs_currency_iso', sql`char_length(${t.currency}) = 3`),
    // A loss with no reason is a loss nobody learns from.
    check('rfqs_lost_needs_reason', sql`${t.status} <> 'lost' OR ${t.lossReasonCode} IS NOT NULL`),
  ],
).enableRLS()

export const rfqClarifications = pgTable(
  'rfq_clarifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    rfqId: uuid('rfq_id')
      .notNull()
      .references(() => rfqs.id, { onDelete: 'cascade' }),

    question: text('question').notNull(),
    askedAt: date('asked_at').notNull(),
    answer: text('answer'),
    answeredAt: date('answered_at'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The stale-clarification scan: unanswered, oldest first.
    index('rfq_clarifications_company_asked_idx').on(t.companyId, t.answeredAt, t.askedAt),
    index('rfq_clarifications_rfq_idx').on(t.rfqId),
    check(
      'rfq_clarifications_answer_has_date',
      sql`${t.answer} IS NULL OR ${t.answeredAt} IS NOT NULL`,
    ),
  ],
).enableRLS()

/**
 * A price the buyer was given. Versioned and superseded — never edited, because version 1
 * is what somebody was told last week and may still be acting on.
 */
export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    rfqId: uuid('rfq_id')
      .notNull()
      .references(() => rfqs.id, { onDelete: 'cascade' }),

    version: integer('version').notNull(),
    /** Which sheet this came from. The NUMBERS are frozen below, not read back from it. */
    costSheetId: uuid('cost_sheet_id').references(() => costSheets.id, { onDelete: 'set null' }),

    /** The frozen breakdown: components, totals, margin, basis. */
    fobBreakdown: jsonb('fob_breakdown').$type<Record<string, unknown>>().notNull().default({}),
    fobPrice: numeric('fob_price', { precision: 14, scale: 4 }).notNull(),
    currency: text('currency').notNull(),
    /** What the factory argues about internally, alongside what the buyer sees. */
    cmBdtEquiv: numeric('cm_bdt_equiv', { precision: 14, scale: 2 }),

    validityDate: date('validity_date'),
    status: quoteStatusEnum('status').notNull().default('draft'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    /** Set when a below-floor quote was approved for sending, and by whom. */
    belowFloorApproval: jsonb('below_floor_approval').$type<Record<string, unknown> | null>(),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('quotes_rfq_version_key').on(t.rfqId, t.version),
    index('quotes_company_rfq_idx').on(t.companyId, t.rfqId, t.version),
    index('quotes_company_status_idx').on(t.companyId, t.status),
    check('quotes_version_positive', sql`${t.version} >= 1`),
    check('quotes_price_positive', sql`${t.fobPrice} > 0`),
    check('quotes_currency_iso', sql`char_length(${t.currency}) = 3`),
    // A sent quote has a date; the validity clock and the buyer conversation depend on it.
    check('quotes_sent_has_date', sql`${t.status} <> 'sent' OR ${t.sentAt} IS NOT NULL`),
  ],
).enableRLS()
