/**
 * 1.5 Costing Studio ⚖
 *
 * Cost sheets are versioned and money-bearing: a quote given in January must still be
 * reproducible in December, after the FX rate moved, the gazette changed and the fabric
 * supplier repriced. So a sheet stores its INPUTS and its computed outputs together, and
 * `superseded` never means deleted.
 *
 * The BOM is separate from the sheet on purpose. A BOM is what the garment is made of —
 * stable across quotes. A cost sheet is what it costs today, and there are usually
 * several against the same BOM.
 */
import { sql } from 'drizzle-orm'
import {
  check,
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

export const bomSourceEnum = pgEnum('bom_source', ['tech_pack_extract', 'manual', 'seeded'])
export const bomGroupEnum = pgEnum('bom_group', ['fabric', 'trims', 'packing', 'embellishment'])
export const costSheetStatusEnum = pgEnum('cost_sheet_status', ['draft', 'approved', 'superseded'])

export const boms = pgTable(
  'boms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    styleCode: text('style_code').notNull(),
    source: bomSourceEnum('source').notNull().default('manual'),
    /** The tech pack it was extracted from, for click-to-source on every line. */
    sourceDocumentId: uuid('source_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('boms_company_style_idx').on(t.companyId, t.styleCode),
  ],
).enableRLS()

export const bomLines = pgTable(
  'bom_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),

    lineGroup: bomGroupEnum('line_group').notNull(),
    /** Store item code where known; free text until procurement has one. */
    itemRef: text('item_ref'),
    spec: text('spec'),

    consumption: numeric('consumption', { precision: 12, scale: 4 }).notNull(),
    uom: text('uom').notNull(),
    wastagePct: numeric('wastage_pct', { precision: 5, scale: 2 }).notNull().default('0'),

    /** Where in the tech pack this line came from — the click-to-source target. */
    sourceDocumentId: uuid('source_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    sourcePage: integer('source_page'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bom_lines_company_bom_idx').on(t.companyId, t.bomId, t.lineGroup),
    check('bom_lines_consumption_positive', sql`${t.consumption} > 0`),
    check('bom_lines_wastage_range', sql`${t.wastagePct} >= 0 AND ${t.wastagePct} <= 100`),
  ],
).enableRLS()

/**
 * A priced sheet ⚖, versioned.
 *
 * `sections` holds the INPUTS exactly as they were entered, and the computed figures sit
 * alongside as columns. Recomputing from the stored inputs must reproduce the stored
 * outputs — that is what makes a quote defensible a year later, and what a variance
 * waterfall compares against.
 */
export const costSheets = pgTable(
  'cost_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    bomId: uuid('bom_id').references(() => boms.id, { onDelete: 'set null' }),
    styleCode: text('style_code').notNull(),
    version: integer('version').notNull().default(1),

    status: costSheetStatusEnum('status').notNull().default('draft'),

    /** Every input the computation took. Recompute → same numbers, forever. */
    sections: jsonb('sections').$type<Record<string, unknown>>().notNull(),

    currency: text('currency').notNull().default('USD'),
    localCurrency: text('local_currency').notNull().default('BDT'),
    /** Snapshotted. A quote at one rate is a different quote at another. */
    fxRateLocalToBase: numeric('fx_rate_local_to_base', { precision: 12, scale: 6 }).notNull(),

    totalCost: numeric('total_cost', { precision: 14, scale: 2 }).notNull(),
    fobPrice: numeric('fob_price', { precision: 14, scale: 2 }).notNull(),
    cmLocalPerPiece: numeric('cm_local_per_piece', { precision: 14, scale: 2 }).notNull(),
    marginPct: numeric('margin_pct', { precision: 6, scale: 2 }).notNull(),
    achievedMarginPct: numeric('achieved_margin_pct', { precision: 6, scale: 2 }).notNull(),

    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cost_sheets_company_style_version_key').on(t.companyId, t.styleCode, t.version),
    index('cost_sheets_company_status_idx').on(t.companyId, t.status),
    index('cost_sheets_company_style_idx').on(t.companyId, t.styleCode),
    check('cost_sheets_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('cost_sheets_fx_positive', sql`${t.fxRateLocalToBase} > 0`),
    check('cost_sheets_version_positive', sql`${t.version} >= 1`),
  ],
).enableRLS()

/** Reusable consumption assumptions per product type, refreshed from closed orders. */
export const consumptionTemplates = pgTable(
  'consumption_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    productType: text('product_type').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull(),
    /** Which closed order's actuals last refreshed this (module 1.6 Order Memory). */
    updatedFromOrderId: uuid('updated_from_order_id'),
    usageCount: integer('usage_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('consumption_templates_company_type_key').on(t.companyId, t.productType),
    // The staleness report: templates unused or unrefreshed for a year.
    index('consumption_templates_company_updated_idx').on(t.companyId, t.updatedAt),
  ],
).enableRLS()
