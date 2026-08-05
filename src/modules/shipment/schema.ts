/**
 * 8.1 Finishing, Cartons & Shipment ⚖
 *
 * The last module before goods leave the country. It carries three of the six named gates
 * (CLAUDE.md rule 8): the EXP number before bank documents, the LC latest-shipment
 * conflict, and final-inspection pass before departure. Three schema decisions follow:
 *
 *  1. **`shipments.exp_number` is nullable, and the gate is in the service.** An EXP number
 *     is issued by the bank against a specific shipment and often arrives after the goods
 *     are booked, so requiring it at insert would stop a factory recording reality. What it
 *     must block is the document handoff — and that is a rule about a transition, which a
 *     column constraint cannot express.
 *  2. **`packing_lists` are versioned and locked on approval.** An approved packing list is
 *     what went to the buyer and the bank. Repacking creates version n+1; it never edits
 *     the one somebody already presented.
 *  3. **`shipment_docs` is a checklist derived from `lc.docs_required`.** Which documents a
 *     particular LC demands varies by bank and buyer, so the checklist is data copied onto
 *     the shipment rather than a fixed set of columns.
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
import { lcs } from '@/modules/commercial/schema'
import { orders, orderStyles } from '@/modules/orders/schema'

export const portStatusEnum = pgEnum('port_status', [
  'planned',
  'ex_factory',
  'at_port',
  'on_board',
  'delivered',
])
export const packingListStatusEnum = pgEnum('packing_list_status', ['draft', 'approved', 'superseded'])
export const shipmentDocStatusEnum = pgEnum('shipment_doc_status', [
  'pending',
  'ready',
  'submitted',
])
export const freightModeEnum = pgEnum('freight_mode', ['sea', 'air'])

/** What came off finishing, per colour × size, per day. The numerator of what can be packed. */
export const finishingOutputs = pgTable(
  'finishing_outputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderStyleId: uuid('order_style_id').references(() => orderStyles.id, {
      onDelete: 'set null',
    }),

    outputDate: date('output_date').notNull(),
    /** `"Colour|Size" → qty`. The pipe is the one character a colour name never has. */
    cells: jsonb('cells').$type<Record<string, number>>().notNull().default({}),
    totalQty: integer('total_qty').notNull().default(0),

    offlineKey: text('offline_key'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per order-style per day; a second submission is a correction, not a new row.
    uniqueIndex('finishing_outputs_order_style_date_key').on(
      t.orderId,
      t.orderStyleId,
      t.outputDate,
    ),
    uniqueIndex('finishing_outputs_offline_key')
      .on(t.companyId, t.offlineKey)
      .where(sql`offline_key IS NOT NULL`),
    index('finishing_outputs_company_order_idx').on(t.companyId, t.orderId, t.outputDate),
    check('finishing_outputs_total_nonneg', sql`${t.totalQty} >= 0`),
  ],
).enableRLS()

export const cartons = pgTable(
  'cartons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** Assigned when the carton is loaded; null while it sits in the finishing store. */
    shipmentId: uuid('shipment_id'),

    cartonNo: text('carton_no').notNull(),
    contents: jsonb('contents').$type<Record<string, number>>().notNull().default({}),
    totalQty: integer('total_qty').notNull(),

    grossKg: numeric('gross_kg', { precision: 10, scale: 2 }),
    netKg: numeric('net_kg', { precision: 10, scale: 2 }),
    lengthCm: numeric('length_cm', { precision: 8, scale: 2 }),
    widthCm: numeric('width_cm', { precision: 8, scale: 2 }),
    heightCm: numeric('height_cm', { precision: 8, scale: 2 }),
    /** Derived from the dimensions and stored — a later dimension edit must not silently
     *  re-rate a carton whose freight was already quoted. */
    cbm: numeric('cbm', { precision: 12, scale: 6 }),

    offlineKey: text('offline_key'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cartons_company_no_key').on(t.companyId, t.cartonNo),
    uniqueIndex('cartons_offline_key')
      .on(t.companyId, t.offlineKey)
      .where(sql`offline_key IS NOT NULL`),
    index('cartons_company_order_idx').on(t.companyId, t.orderId),
    index('cartons_shipment_idx').on(t.shipmentId),
    check('cartons_total_positive', sql`${t.totalQty} > 0`),
    // Net cannot exceed gross; a carton weighing less than its contents is a typo that
    // would go straight onto a bill of lading.
    check(
      'cartons_net_within_gross',
      sql`${t.netKg} IS NULL OR ${t.grossKg} IS NULL OR ${t.netKg} <= ${t.grossKg}`,
    ),
  ],
).enableRLS()

/**
 * A shipment ⚖. `expNumber` is the export permit number the bank issues; without it the
 * document handoff to 2.1 is blocked — enforced in the service, because the rule is about
 * a transition and not about the row.
 */
export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    lcId: uuid('lc_id').references(() => lcs.id, { onDelete: 'restrict' }),

    /** 1, 2, 3 … for a part-shipped order. Unique per order. */
    partialNo: integer('partial_no').notNull().default(1),
    plannedExFactory: date('planned_ex_factory').notNull(),
    actualExFactory: date('actual_ex_factory'),

    /** Buyer-nominated forwarder. No FK: nominations belong to 1.1 Buyer Desk. */
    forwarder: text('forwarder'),
    bookingRef: text('booking_ref'),
    /** The gate: bank documents cannot be handed off without this. */
    expNumber: text('exp_number'),
    blAwb: text('bl_awb'),
    mode: freightModeEnum('mode').notNull().default('sea'),

    portStatus: portStatusEnum('port_status').notNull().default('planned'),
    /** Set when a tolerance breach was knowingly accepted, with the approval that did it. */
    toleranceOverride: jsonb('tolerance_override').$type<Record<string, unknown> | null>(),
    /**
     * Set when a FAILED final inspection was knowingly waived. A buyer does sometimes accept
     * a failed lot at a discount; the waiver records who decided that and why, because the
     * alternative is a shipment that departed against its own QC verdict with no trace.
     */
    qcWaiver: jsonb('qc_waiver').$type<Record<string, unknown> | null>(),
    /**
     * Set when a shipment was knowingly sent against a credit that cannot accept its date —
     * past the latest shipment date, or past expiry.
     *
     * A factory does ship late and then negotiates: the buyer amends the credit, or accepts
     * the discrepancy at the counter, or takes the goods on collection instead. All of those
     * are decisions somebody makes on purpose, so the waiver records who and why. Without
     * it, `confirmExFactory` refuses — which is the point, because the alternative is a
     * container leaving against a dead credit and nobody finding out until the bank refuses
     * the presentation weeks later (audit BE-H2).
     */
    lcWaiver: jsonb('lc_waiver').$type<Record<string, unknown> | null>(),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shipments_order_partial_key').on(t.orderId, t.partialNo),
    index('shipments_company_order_idx').on(t.companyId, t.orderId),
    index('shipments_company_status_idx').on(t.companyId, t.portStatus, t.plannedExFactory),
    // The latest-shipment countdown scans by LC.
    index('shipments_lc_idx').on(t.lcId),
    index('shipments_company_planned_idx').on(t.companyId, t.plannedExFactory),
    check('shipments_partial_positive', sql`${t.partialNo} >= 1`),
  ],
).enableRLS()

/**
 * A packing list, versioned. Approving one LOCKS it: an approved list is what went to the
 * buyer and the bank, and repacking produces version n+1 rather than editing it.
 */
export const packingLists = pgTable(
  'packing_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'set null' }),

    version: integer('version').notNull(),
    /** The rendered list: cartons, contents, weights, totals — frozen at generation. */
    generated: jsonb('generated').$type<Record<string, unknown>>().notNull().default({}),
    /** Derived against the order breakdown at generation time, and kept. */
    mismatches: jsonb('mismatches').$type<unknown[]>().notNull().default([]),
    totalCartons: integer('total_cartons').notNull().default(0),
    totalQty: integer('total_qty').notNull().default(0),

    status: packingListStatusEnum('status').notNull().default('draft'),
    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('packing_lists_order_version_key').on(t.orderId, t.version),
    index('packing_lists_company_order_idx').on(t.companyId, t.orderId, t.version),
    index('packing_lists_company_status_idx').on(t.companyId, t.status),
    check('packing_lists_version_positive', sql`${t.version} >= 1`),
    // An approved list must say who approved it and when. A locked document with no
    // signature is a document nobody can stand behind.
    check(
      'packing_lists_approved_has_signature',
      sql`${t.status} <> 'approved' OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`,
    ),
  ],
).enableRLS()

/**
 * The bank's document checklist for one shipment, copied from `lc.docs_required`. Which
 * documents a particular LC demands varies by bank and buyer, so this is data rather than
 * a fixed set of columns.
 */
export const shipmentDocs = pgTable(
  'shipment_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),

    /** e.g. 'commercial_invoice', 'bl', 'coo', 'packing_list', 'insurance'. */
    kind: text('kind').notNull(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    status: shipmentDocStatusEnum('status').notNull().default('pending'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shipment_docs_shipment_kind_key').on(t.shipmentId, t.kind),
    index('shipment_docs_company_shipment_idx').on(t.companyId, t.shipmentId),
    index('shipment_docs_company_status_idx').on(t.companyId, t.status),
    // `ready` means the file is attached. A ready row with no document is a checklist
    // that lies to whoever is assembling the bank submission.
    check(
      'shipment_docs_ready_has_document',
      sql`${t.status} = 'pending' OR ${t.documentId} IS NOT NULL`,
    ),
    check(
      'shipment_docs_submitted_has_date',
      sql`${t.status} <> 'submitted' OR ${t.submittedAt} IS NOT NULL`,
    ),
  ],
).enableRLS()
