/**
 * 5.1 Cutting Floor ⚖
 *
 * The point of no return. Everything upstream of cutting can be revised; nothing
 * downstream of it can be un-cut. Two design consequences run through this file:
 *
 *  1. **A cut report records WHICH breakdown revision it was cut against.** The buyer can
 *     revise the size grid the week after cutting starts, and a report validated against
 *     "the active revision" with no record of which one that was is a report nobody can
 *     defend when the shipment is short.
 *  2. **Rolls drawn are recorded on the lay.** Wastage is drawn fabric versus marker plan,
 *     and the drawn side of that has to trace back to specific rolls in the store — an
 *     aggregate metre figure cannot be audited against a bonded UD.
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

import { companies, users } from '@/db/schema/core'
import { orders, orderStyles } from '@/modules/orders/schema'

export const layStatusEnum = pgEnum('lay_status', ['open', 'cut', 'cancelled'])
export const bundleStatusEnum = pgEnum('bundle_status', ['created', 'in_sewing', 'done'])

/**
 * A marker: the arrangement of pattern pieces the cutter lays fabric under.
 *
 * `sizeRatio` is pieces of each size in ONE ply. A 1:2:1 marker at 100 plies yields
 * 100/200/100 — the ratio is the marker's identity, and changing it makes a new marker
 * rather than an edit, which is why there is no revision column here.
 */
export const markers = pgTable(
  'markers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    code: text('code').notNull(),
    styleCode: text('style_code').notNull(),
    /** size → pieces per ply. */
    sizeRatio: jsonb('size_ratio').$type<Record<string, number>>().notNull(),
    /** Marker efficiency: area used against area laid. Informational, not a gate. */
    efficiencyPct: numeric('efficiency_pct', { precision: 5, scale: 2 }),
    fabricWidthInches: numeric('fabric_width_inches', { precision: 6, scale: 2 }),
    layLengthMeters: numeric('lay_length_meters', { precision: 12, scale: 2 }).notNull(),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('markers_company_code_key').on(t.companyId, t.code),
    index('markers_company_style_idx').on(t.companyId, t.styleCode),
    check('markers_lay_length_positive', sql`${t.layLengthMeters} > 0`),
    check(
      'markers_efficiency_range',
      sql`${t.efficiencyPct} IS NULL OR (${t.efficiencyPct} > 0 AND ${t.efficiencyPct} <= 100)`,
    ),
  ],
).enableRLS()

/**
 * One spread of fabric on the table. Floor-facing and offline-capable — a cutting floor
 * tablet loses the network constantly, so every lay carries the device's idempotency key.
 */
export const lays = pgTable(
  'lays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderStyleId: uuid('order_style_id')
      .notNull()
      .references(() => orderStyles.id, { onDelete: 'restrict' }),
    markerId: uuid('marker_id')
      .notNull()
      .references(() => markers.id, { onDelete: 'restrict' }),

    layNo: text('lay_no').notNull(),
    color: text('color').notNull(),
    plies: integer('plies').notNull(),
    layLengthMeters: numeric('lay_length_meters', { precision: 12, scale: 2 }).notNull(),

    /**
     * Store rolls consumed by this lay. Kept as an array rather than a join table because
     * a lay draws its rolls once, atomically, and never edits the set afterwards.
     */
    rollsDrawn: uuid('rolls_drawn').array().notNull().default(sql`'{}'::uuid[]`),
    fabricDrawnMeters: numeric('fabric_drawn_meters', { precision: 12, scale: 2 }),

    status: layStatusEnum('status').notNull().default('open'),

    /** Device-generated idempotency key — see modules/core/offline-sync. */
    offlineKey: text('offline_key'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lays_company_lay_no_key').on(t.companyId, t.layNo),
    uniqueIndex('lays_offline_key').on(t.companyId, t.offlineKey).where(sql`offline_key IS NOT NULL`),
    index('lays_company_order_idx').on(t.companyId, t.orderId, t.createdAt.desc()),
    index('lays_company_status_idx').on(t.companyId, t.status),
    check('lays_plies_positive', sql`${t.plies} > 0`),
    check('lays_length_positive', sql`${t.layLengthMeters} > 0`),
  ],
).enableRLS()

/**
 * What actually came off the table ⚖.
 *
 * `breakdownRevision` is the load-bearing column: it records which revision of the buyer's
 * size grid this report was validated against. Without it, a later revision makes every
 * historic report unexplainable.
 */
export const cutReports = pgTable(
  'cut_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    layId: uuid('lay_id')
      .notNull()
      .references(() => lays.id, { onDelete: 'cascade' }),

    /** color × size → qty, as cut. */
    cells: jsonb('cells').$type<Record<string, number>>().notNull().default({}),
    /** Which revision of the breakdown this was checked against. Never recomputed. */
    breakdownRevision: integer('breakdown_revision').notNull(),
    tolerancePct: numeric('tolerance_pct', { precision: 5, scale: 2 }).notNull(),
    /** Per-cell variance at the moment of reporting, including accepted exceptions. */
    variances: jsonb('variances').$type<unknown[]>().notNull().default([]),

    offlineKey: text('offline_key'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One report per lay. A second report is a correction, and corrections go through
    // pending_changes rather than by writing another row nobody can order.
    uniqueIndex('cut_reports_lay_key').on(t.layId),
    uniqueIndex('cut_reports_offline_key')
      .on(t.companyId, t.offlineKey)
      .where(sql`offline_key IS NOT NULL`),
    index('cut_reports_company_created_idx').on(t.companyId, t.createdAt.desc()),
    check('cut_reports_revision_positive', sql`${t.breakdownRevision} >= 1`),
  ],
).enableRLS()

/**
 * A tied stack of cut pieces travelling to sewing. `qrToken` is what the ticket encodes
 * and what a scanner sends back — separate from the row id so a leaked ticket photo does
 * not expose an internal identifier.
 */
export const bundles = pgTable(
  'bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    cutReportId: uuid('cut_report_id')
      .notNull()
      .references(() => cutReports.id, { onDelete: 'cascade' }),

    bundleNo: text('bundle_no').notNull(),
    color: text('color').notNull(),
    size: text('size').notNull(),
    qty: integer('qty').notNull(),
    qrToken: text('qr_token').notNull(),

    status: bundleStatusEnum('status').notNull().default('created'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bundles_report_no_key').on(t.cutReportId, t.bundleNo),
    uniqueIndex('bundles_qr_token_key').on(t.qrToken),
    index('bundles_company_status_idx').on(t.companyId, t.status),
    index('bundles_company_report_idx').on(t.companyId, t.cutReportId),
    check('bundles_qty_positive', sql`${t.qty} > 0`),
  ],
).enableRLS()

/**
 * Derived per order ⚖ — recomputed from lays, never accumulated incrementally. An
 * incremental counter that drifts is worse than one that is slow to read, because a
 * wastage figure is what a factory argues about with its own owner.
 */
export const cutWastage = pgTable(
  'cut_wastage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    fabricDrawn: numeric('fabric_drawn', { precision: 14, scale: 2 }).notNull(),
    markerConsumption: numeric('marker_consumption', { precision: 14, scale: 2 }).notNull(),
    /** Signed: under-draw is negative, not clamped to zero. */
    wastagePct: numeric('wastage_pct', { precision: 7, scale: 2 }).notNull(),
    unit: text('unit').notNull().default('m'),

    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cut_wastage_order_key').on(t.orderId),
    index('cut_wastage_company_idx').on(t.companyId),
  ],
).enableRLS()
