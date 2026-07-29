/**
 * 1.4 Sampling.
 *
 * The sample room is where a buyer's opinion becomes a fact the factory can act on, and
 * `sample_feedback_rounds` is the table that records it. Two decisions run through this
 * schema:
 *
 *  1. **Rounds are append-only and numbered.** A buyer who approves round 1, sees the
 *     corrected sample and rejects round 2 has withdrawn the approval. Overwriting a
 *     verdict in place would leave the factory cutting against a decision nobody made.
 *  2. **`sample_requests` links to an RFQ or to an order, never both.** A proto sample is
 *     made to win the order; a PP sample is made against one that exists. Enforced by a
 *     check constraint, because the two flows are read by different screens and a row
 *     that is in both is in neither.
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
import { orders } from '@/modules/orders/schema'

export const sampleTypeEnum = pgEnum('sample_type', [
  'proto',
  'fit',
  'sms',
  'pp',
  'top',
  'shipment',
])
export const sampleRequestStatusEnum = pgEnum('sample_request_status', [
  'requested',
  'in_work',
  'dispatched',
  'feedback',
  'approved',
  'rejected',
  'closed',
])
export const sampleStageEnum = pgEnum('sample_stage', [
  'pattern',
  'cutting',
  'sewing',
  'finishing',
  'qc',
  'dispatched',
])
export const sampleVerdictEnum = pgEnum('sample_verdict', [
  'approved',
  'approved_with_comments',
  'rejected',
])

export const sampleRequests = pgTable(
  'sample_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /**
     * Exactly one of these. No FK on `rfq_id`: module 1.2 RFQ does not exist yet — see
     * docs/STUBS.md.
     */
    rfqId: uuid('rfq_id'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),

    type: sampleTypeEnum('type').notNull(),
    /**
     * Matched against the order style's code by the PP gate. Not an `order_style_id`
     * because proto and SMS samples are made before any order exists, and a column that
     * is null for half the rows cannot be the join key for the other half.
     */
    styleCode: text('style_code').notNull(),
    requestNo: text('request_no').notNull(),
    dueDate: date('due_date'),

    status: sampleRequestStatusEnum('status').notNull().default('requested'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sample_requests_company_no_key').on(t.companyId, t.requestNo),
    // The PP gate's lookup: this order, this style, this type.
    index('sample_requests_gate_idx').on(t.companyId, t.orderId, t.styleCode, t.type),
    index('sample_requests_company_due_idx').on(t.companyId, t.dueDate),
    index('sample_requests_company_status_idx').on(t.companyId, t.status, t.dueDate),
    check(
      'sample_requests_rfq_xor_order',
      sql`(${t.rfqId} IS NULL) <> (${t.orderId} IS NULL)`,
    ),
  ],
).enableRLS()

/**
 * Where the sample is in the sample room. Floor-facing and offline-queued, so each event
 * carries the device's idempotency key.
 */
export const sampleStageEvents = pgTable(
  'sample_stage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sampleRequestId: uuid('sample_request_id')
      .notNull()
      .references(() => sampleRequests.id, { onDelete: 'cascade' }),

    stage: sampleStageEnum('stage').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    offlineKey: text('offline_key'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One event per stage per sample: a stage is reached once, and re-reaching it is a
    // replayed tablet rather than a second pass through the sample room.
    uniqueIndex('sample_stage_events_request_stage_key').on(t.sampleRequestId, t.stage),
    uniqueIndex('sample_stage_events_offline_key')
      .on(t.companyId, t.offlineKey)
      .where(sql`offline_key IS NOT NULL`),
    index('sample_stage_events_company_request_idx').on(t.companyId, t.sampleRequestId),
  ],
).enableRLS()

export const sampleDispatches = pgTable(
  'sample_dispatches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sampleRequestId: uuid('sample_request_id')
      .notNull()
      .references(() => sampleRequests.id, { onDelete: 'cascade' }),

    courier: text('courier').notNull(),
    /** Air waybill. What merchandising quotes to the buyer when they ask where it is. */
    awb: text('awb').notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp('received_at', { withTimezone: true }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sample_dispatches_company_request_idx').on(t.companyId, t.sampleRequestId),
    index('sample_dispatches_company_awb_idx').on(t.companyId, t.awb),
  ],
).enableRLS()

/**
 * The buyer's verdict, per round. Append-only and numbered — the LATEST round is the one
 * in force, and an approval the buyer later withdrew must not still read as an approval.
 */
export const sampleFeedbackRounds = pgTable(
  'sample_feedback_rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sampleRequestId: uuid('sample_request_id')
      .notNull()
      .references(() => sampleRequests.id, { onDelete: 'cascade' }),

    round: integer('round').notNull(),
    verdict: sampleVerdictEnum('verdict').notNull(),
    /** [{ area, comment, page? }] — extracted from a comment sheet or typed. */
    comments: jsonb('comments').$type<unknown[]>().notNull().default([]),
    recordedOn: date('recorded_on').notNull(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The uniqueness the gate's "latest round" depends on. Two round 2s would make the
    // verdict in force a question of row order.
    uniqueIndex('sample_feedback_rounds_request_round_key').on(t.sampleRequestId, t.round),
    index('sample_feedback_rounds_company_request_idx').on(t.companyId, t.sampleRequestId),
    check('sample_feedback_rounds_round_positive', sql`${t.round} >= 1`),
  ],
).enableRLS()

/**
 * What the sample room spent. BDT — samples are made and paid for locally, whatever
 * currency the order is priced in.
 */
export const sampleCosts = pgTable(
  'sample_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sampleRequestId: uuid('sample_request_id')
      .notNull()
      .references(() => sampleRequests.id, { onDelete: 'cascade' }),

    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('BDT'),
    note: text('note'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sample_costs_company_request_idx').on(t.companyId, t.sampleRequestId),
    check('sample_costs_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('sample_costs_amount_positive', sql`${t.amount} > 0`),
  ],
).enableRLS()

export const samplePhotos = pgTable(
  'sample_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sampleRequestId: uuid('sample_request_id')
      .notNull()
      .references(() => sampleRequests.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sample_photos_request_document_key').on(t.sampleRequestId, t.documentId),
    index('sample_photos_company_request_idx').on(t.companyId, t.sampleRequestId),
  ],
).enableRLS()
