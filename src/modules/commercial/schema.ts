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
     * No FK yet: `suppliers` is owned by module 3.2 (Procurement) and does not exist.
     * The constraint lands with that module — see docs/STUBS.md.
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
