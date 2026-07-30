/**
 * 11.1 Commercial Finance ⚖
 *
 * The brief's explicit non-goal is the most important thing about this schema: **no general
 * ledger.** There are no journals, no accounts and no double entry, because a factory that
 * already runs Tally does not need a second one — it needs to know when cash arrives and
 * whether an order made money. Everything here serves one of those two questions.
 *
 * Two decisions follow:
 *
 *  1. **`receivables.realized_amount` is separate from the invoice value.** The bank deducts
 *     its charges before crediting, so realized < invoiced is normal. A receivable derived
 *     from the invoice alone would stay open by the deduction forever.
 *  2. **`order_costs_actual` is an ACCRUAL, recomputed from source.** Materials come from
 *     store issues, CM from a payroll allocation, commercial from bank charges and freight.
 *     Nobody types these, and each carries the basis it was computed on so a variance
 *     against a quote is comparing like with like.
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

export const receivableStatusEnum = pgEnum('receivable_status', [
  'open',
  'part_realized',
  'realized',
  'written_off',
])
export const payableStatusEnum = pgEnum('payable_status', ['open', 'part_paid', 'paid', 'cancelled'])

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    /** No FK: `shipments` belongs to 8.1, which does not import this module. */
    shipmentId: uuid('shipment_id'),

    number: text('number').notNull(),
    invoiceDate: date('invoice_date').notNull(),
    value: numeric('value', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invoices_company_number_key').on(t.companyId, t.number),
    index('invoices_company_order_idx').on(t.companyId, t.orderId),
    index('invoices_shipment_idx').on(t.shipmentId),
    check('invoices_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('invoices_value_positive', sql`${t.value} > 0`),
  ],
).enableRLS()

/**
 * Money owed to the factory ⚖. `expectedAt` comes from the buyer's own realization-lag
 * model (2.1 computes it) rather than from payment terms — terms say 30 days and the bank
 * takes 45, and a cash forecast built on the terms is a forecast that is always early.
 */
export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    /** No FK: `doc_submissions` belongs to 2.1. Posted from `finance.realized`. */
    submissionId: uuid('submission_id'),

    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    /** From the lag model, not from payment terms. */
    expectedAt: date('expected_at').notNull(),
    /** How the expectation was arrived at, so a wrong forecast can be explained. */
    expectedBasis: jsonb('expected_basis').$type<Record<string, unknown>>().notNull().default({}),

    realizedAmount: numeric('realized_amount', { precision: 14, scale: 2 }),
    realizedAt: date('realized_at'),
    /** invoiced − realized. Stored because the bank's deduction is a real cost. */
    shortfall: numeric('shortfall', { precision: 14, scale: 2 }),

    status: receivableStatusEnum('status').notNull().default('open'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('receivables_invoice_key').on(t.invoiceId),
    // The cash timeline's read: everything still open, by expected date.
    index('receivables_company_expected_idx').on(t.companyId, t.status, t.expectedAt),
    index('receivables_submission_idx').on(t.submissionId),
    check('receivables_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('receivables_amount_positive', sql`${t.amount} > 0`),
    check(
      'receivables_realized_has_date',
      sql`${t.realizedAmount} IS NULL OR ${t.realizedAt} IS NOT NULL`,
    ),
  ],
).enableRLS()

/** Money the factory owes ⚖ — a supplier PO or a GRN it has not paid for yet. */
export const payables = pgTable(
  'payables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** No FKs: both belong to 3.2 and 3.1, and a payable may reference either. */
    supplierPoId: uuid('supplier_po_id'),
    grnId: uuid('grn_id'),

    reference: text('reference').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    dueAt: date('due_at').notNull(),

    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }),
    paidAt: date('paid_at'),
    status: payableStatusEnum('status').notNull().default('open'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payables_company_reference_key').on(t.companyId, t.reference),
    index('payables_company_due_idx').on(t.companyId, t.status, t.dueAt),
    index('payables_supplier_po_idx').on(t.supplierPoId),
    check('payables_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('payables_amount_positive', sql`${t.amount} > 0`),
    check('payables_has_parent', sql`${t.supplierPoId} IS NOT NULL OR ${t.grnId} IS NOT NULL`),
    check('payables_paid_has_date', sql`${t.paidAmount} IS NULL OR ${t.paidAt} IS NOT NULL`),
  ],
).enableRLS()

/**
 * What the order actually cost, accrued ⚖. Recomputed from source every time, never
 * incremented — a drifting accrual is worse than a slow read for the number an owner uses
 * to decide whether to take that buyer's next order.
 *
 * `components` is a map rather than fixed columns because the variance waterfall compares it
 * against a cost sheet's sections, and those are the module's vocabulary, not a schema
 * decision. `basis` records HOW each component was derived, so a figure somebody disputes
 * can be traced rather than defended.
 */
export const orderCostsActual = pgTable(
  'order_costs_actual',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** `{ materials: "3.45", cm: "0.90", commercial: "0.31" }` — per piece. */
    components: jsonb('components').$type<Record<string, string>>().notNull().default({}),
    totalPerPiece: numeric('total_per_piece', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    /** Pieces the accrual was divided by. A per-piece cost is meaningless without it. */
    pieces: integer('pieces').notNull(),
    /** Per component: which module the figure came from and what it was computed on. */
    basis: jsonb('basis').$type<Record<string, unknown>>().notNull().default({}),

    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_costs_actual_order_key').on(t.orderId),
    index('order_costs_actual_company_idx').on(t.companyId),
    check('order_costs_actual_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('order_costs_actual_pieces_positive', sql`${t.pieces} > 0`),
  ],
).enableRLS()

/**
 * Quoted against actual ⚖. `marginBasis` is stored because margin on price and margin on
 * cost are different numbers, and a variance between two figures computed on different bases
 * is made entirely of arithmetic.
 */
export const orderProfitabilityRows = pgTable(
  'order_profitability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    fobPrice: numeric('fob_price', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    quotedMarginPct: numeric('quoted_margin_pct', { precision: 7, scale: 2 }).notNull(),
    actualMarginPct: numeric('actual_margin_pct', { precision: 7, scale: 2 }).notNull(),
    /** Which basis BOTH figures are on. Never inferred. */
    marginBasis: text('margin_basis').notNull(),
    /** `[{ component, quoted, actual, variance }]` — the waterfall, frozen. */
    variance: jsonb('variance').$type<unknown[]>().notNull().default([]),

    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_profitability_order_key').on(t.orderId),
    index('order_profitability_company_margin_idx').on(t.companyId, t.actualMarginPct),
    check('order_profitability_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('order_profitability_basis', sql`${t.marginBasis} IN ('price', 'cost')`),
  ],
).enableRLS()
