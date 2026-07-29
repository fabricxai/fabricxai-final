/**
 * Letters of Credit ⚖ — owned by `commercial` (architecture §2.3, CLAUDE.md rule 11).
 *
 * Created during Phase 3 with module 2.1's schema, because Orders cannot detect an LC
 * conflict against a table that does not exist. Orders links through `order_lcs` and
 * reads through this module — it never writes here.
 *
 * Why the dates carry so much weight: ship after `latest_shipment_date`, or present
 * documents after `expiry_date`, and the bank can refuse. A refused document turns a
 * shipped order into an unpaid one, which is why conflicts on these two columns are red
 * alerts in every screen that touches an order.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
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

export const lcStatusEnum = pgEnum('lc_status', ['draft', 'active', 'expired', 'closed'])

export const lcs = pgTable(
  'lcs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id, { onDelete: 'restrict' }),

    /** The LC number as the bank issued it. Unique per company. */
    number: text('number').notNull(),

    value: numeric('value', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    /** Permitted over/under shipment, e.g. 5.00 for ±5%. Straight from the credit. */
    tolerancePct: numeric('tolerance_pct', { precision: 5, scale: 2 }).notNull().default('0'),

    issueDate: date('issue_date'),
    /** Goods must be shipped on or before this date. */
    latestShipmentDate: date('latest_shipment_date'),
    /** Documents must be presented on or before this date. */
    expiryDate: date('expiry_date'),

    /** Clause-derived list of documents the bank will require at presentation. */
    docsRequired: jsonb('docs_required').$type<Record<string, unknown>>().notNull().default({}),

    status: lcStatusEnum('status').notNull().default('draft'),
    /** The scanned credit itself — every figure above should be checkable against it. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lcs_company_number_key').on(t.companyId, t.number),
    index('lcs_company_buyer_idx').on(t.companyId, t.buyerId),
    // The nightly countdown scan: live credits by the date that bites first.
    index('lcs_company_latest_shipment_idx').on(t.companyId, t.latestShipmentDate),
    index('lcs_company_expiry_idx').on(t.companyId, t.expiryDate),
    check('lcs_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('lcs_value_positive', sql`${t.value} > 0`),
    // Presenting documents before the goods may ship is not a thing; a credit whose
    // expiry precedes its latest shipment date was mis-keyed.
    check(
      'lcs_expiry_after_latest_shipment',
      sql`${t.expiryDate} IS NULL OR ${t.latestShipmentDate} IS NULL
        OR ${t.expiryDate} >= ${t.latestShipmentDate}`,
    ),
  ],
).enableRLS()

/**
 * Back-to-back LCs ⚖ — the credits the factory opens against the master to buy fabric and
 * trims. Σ(btb values) must stay within `master.value × btb_limit_pct` (Settings), or the
 * factory owes its suppliers more than the buyer will ever pay it. Enforced as a gate in
 * the service layer, never in the UI.
 */
export const btbLcs = pgTable(
  'btb_lcs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    masterLcId: uuid('master_lc_id')
      .notNull()
      .references(() => lcs.id, { onDelete: 'restrict' }),

    number: text('number').notNull(),
    /**
     * The FK exists in the database (migration 0030) but is deliberately NOT expressed
     * here: `suppliers` is owned by 3.2 Procurement, whose schema already imports
     * `btb_lcs` for the import-PO gate, so declaring it would make the two module schemas
     * import each other. Drizzle diffs against its own snapshot rather than the live
     * database, so an unmodelled constraint is invisible to `db:generate` and safe —
     * but the next reader needs to know it is enforced.
     */
    supplierId: uuid('supplier_id'),

    value: numeric('value', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    openedAt: date('opened_at'),
    expiryDate: date('expiry_date'),

    status: lcStatusEnum('status').notNull().default('draft'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('btb_lcs_company_number_key').on(t.companyId, t.number),
    // The headroom query: every BTB opened against one master.
    index('btb_lcs_master_idx').on(t.companyId, t.masterLcId),
    check('btb_lcs_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('btb_lcs_value_positive', sql`${t.value} > 0`),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// Bonded warehouse — Utilization Declarations ⚖ (brief 2.2)
// ─────────────────────────────────────────────────────────────────────────────

export const udStatusEnum = pgEnum('ud_status', ['active', 'exhausted', 'expired', 'closed'])

/**
 * The customs document authorising duty-free import of specific items in specific
 * quantities, against a promise they leave again as exported garments.
 *
 * `authorized_items` is jsonb rather than a child table on purpose: it is a transcription
 * of what the declaration says, amended only by customs, and it is read as a whole every
 * time the gate runs. Splitting it into rows would invite the application to "correct" a
 * line, and the one thing this data must not be is editable piecemeal.
 */
export const uds = pgTable(
  'uds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    number: text('number').notNull(),
    issueDate: date('issue_date'),
    /** Inclusive — a draw on this date is still valid. */
    validUntil: date('valid_until'),

    /** `UdAuthorizedItem[]` — validated by zod on write, read whole by the gate. */
    authorizedItems: jsonb('authorized_items').$type<unknown[]>().notNull().default([]),

    status: udStatusEnum('status').notNull().default('active'),
    /** The scanned declaration; every figure above should be checkable against it. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uds_company_number_key').on(t.companyId, t.number),
    // The nightly expiry alert: live declarations by the date that bites.
    index('uds_company_valid_until_idx').on(t.companyId, t.status, t.validUntil),
  ],
).enableRLS()

/**
 * Every draw against a UD ⚖. Written automatically by a bonded store issue, never by
 * hand — the ledger is what a customs reconciliation is built from, so a row here always
 * corresponds to material that actually left the bonded warehouse.
 */
export const udConsumptions = pgTable(
  'ud_consumptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    udId: uuid('ud_id')
      .notNull()
      .references(() => uds.id, { onDelete: 'restrict' }),

    /**
     * No FK yet: `store_issues` belongs to module 3.1 and does not exist. The constraint
     * lands with that module — see docs/STUBS.md.
     */
    storeIssueId: uuid('store_issue_id'),

    itemRef: text('item_ref').notNull(),
    /** numeric(12,2) per the brief; metres, kilograms or pieces. Never a float. */
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull(),
    unit: text('unit').notNull(),

    /** Set when an owner approved a deliberate overdraw through pending_changes. */
    overrideOf: uuid('override_of').references(() => uds.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The gate's own query: every draw against one UD, read under a row lock.
    index('ud_consumptions_ud_idx').on(t.companyId, t.udId, t.itemRef),
    index('ud_consumptions_store_issue_idx').on(t.storeIssueId),
    check('ud_consumptions_qty_positive', sql`${t.qty} > 0`),
  ],
).enableRLS()

/** A period snapshot plus the customs-format PDF generated from it. */
export const udReconciliations = pgTable(
  'ud_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    udId: uuid('ud_id')
      .notNull()
      .references(() => uds.id, { onDelete: 'cascade' }),

    /** `YYYY-MM` — reconciliation is monthly. */
    period: text('period').notNull(),
    /** Frozen balances as at generation; the PDF must stay reproducible. */
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    generatedDocumentId: uuid('generated_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ud_reconciliations_ud_period_key').on(t.udId, t.period),
    index('ud_reconciliations_company_period_idx').on(t.companyId, t.period),
  ],
).enableRLS()
