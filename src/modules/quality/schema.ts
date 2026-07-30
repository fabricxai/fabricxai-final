/**
 * 7.1 Inline, Endline & Final Inspection ⚖
 *
 * `final_inspections` is the ⚖ table: an AQL verdict is what a buyer's inspector and the
 * factory argue about when a shipment is held, and it has to be reproducible months later.
 * Three decisions in this schema exist for that reason:
 *
 *  1. **The AQL plan is SNAPSHOTTED onto the inspection.** Sample size and both acceptance
 *     numbers are stored on the row, not looked up when the report is printed. `aql_tables`
 *     is versioned, buyer terms change, and a verdict that recomputes itself from today's
 *     table is a verdict nobody can defend.
 *  2. **Defects are counted in three classes, never one.** Critical, major and minor are
 *     separate columns because they are judged against separate acceptance numbers.
 *  3. **`inline_checks` is the hot table.** A supervisor taps it every few minutes across
 *     every line, and `dhu_daily` is derived from it rather than incremented — a counter
 *     that drifts is worse than a slow read for a number that goes in a buyer report.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
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
import { orders, orderStyles } from '@/modules/orders/schema'
import { lines } from '@/modules/planning/schema'
import { grns, rolls } from '@/modules/store/schema'

export const defectSeverityEnum = pgEnum('defect_severity', ['critical', 'major', 'minor'])
export const inspectionResultEnum = pgEnum('inspection_result', ['pass', 'fail'])
export const finalInspectionStatusEnum = pgEnum('final_inspection_status', [
  'draft',
  'submitted',
  'reinspection_required',
  'closed',
])
export const inspectionAgencyEnum = pgEnum('inspection_agency', [
  'sgs',
  'intertek',
  'bv',
  'other',
])

/**
 * The defect taxonomy. Seeded with a standard set and extendable per company — a factory
 * sewing outerwear needs codes a t-shirt factory never uses, and forcing them into
 * "other" destroys the pattern analysis the repeat-defect alert depends on.
 */
export const defectCodes = pgTable(
  'defect_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    category: text('category').notNull(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    /**
     * The class this code counts as at final inspection. Stored on the code so an
     * inspector taps a defect rather than choosing a severity, and two inspectors cannot
     * classify the same defect differently.
     */
    severity: defectSeverityEnum('severity').notNull(),
    /** False hides it from the tap grid without deleting the history that references it. */
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('defect_codes_company_code_key').on(t.companyId, t.code),
    index('defect_codes_company_category_idx').on(t.companyId, t.category, t.isActive),
  ],
).enableRLS()

/**
 * A supervisor's spot check on the line. The ≤3-tap payload the brief asks for: pick the
 * operation, tap the defect, done. Offline-queued, because this is captured on a tablet
 * standing next to a sewing machine.
 */
export const inlineChecks = pgTable(
  'inline_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    // Cascade, matching 6.1's references to `lines`: deleting a company must cascade all
    // the way, and a `restrict` here fires before the company-level cascade reaches it.
    lineId: uuid('line_id')
      .notNull()
      .references(() => lines.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),

    checkedOn: date('checked_on').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    operation: text('operation').notNull(),
    /** No FK: `employees` is owned by 10.1 Workforce — see docs/STUBS.md. */
    operatorId: uuid('operator_id'),

    /** How many garments this check looked at. The denominator of DHU. */
    checkedQty: integer('checked_qty').notNull(),
    /** [{ code, count }] — the tap payload, verbatim. */
    defects: jsonb('defects').$type<{ code: string; count: number }[]>().notNull().default([]),
    /** Denormalised sum of the defect counts, so DHU does not have to open the jsonb. */
    defectQty: integer('defect_qty').notNull().default(0),

    offlineKey: text('offline_key'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inline_checks_offline_key')
      .on(t.companyId, t.offlineKey)
      .where(sql`offline_key IS NOT NULL`),
    // The day-close scan and the DHU trend both read (company, line, date).
    index('inline_checks_company_line_date_idx').on(t.companyId, t.lineId, t.checkedOn),
    index('inline_checks_company_date_idx').on(t.companyId, t.checkedOn),
    index('inline_checks_company_operation_idx').on(t.companyId, t.operation, t.checkedOn),
    check('inline_checks_checked_positive', sql`${t.checkedQty} > 0`),
    check('inline_checks_defects_nonneg', sql`${t.defectQty} >= 0`),
  ],
).enableRLS()

/** Derived at day close from `inline_checks`. Recomputed, never incremented. */
export const dhuDaily = pgTable(
  'dhu_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => lines.id, { onDelete: 'cascade' }),

    dhuDate: date('dhu_date').notNull(),
    defects: integer('defects').notNull(),
    checked: integer('checked').notNull(),
    /** Can exceed 100 — one garment carries several defects. Not clamped. */
    dhu: numeric('dhu', { precision: 8, scale: 2 }).notNull(),

    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dhu_daily_line_date_key').on(t.lineId, t.dhuDate),
    index('dhu_daily_company_date_idx').on(t.companyId, t.dhuDate),
    check('dhu_daily_checked_positive', sql`${t.checked} > 0`),
  ],
).enableRLS()

/**
 * 4-point fabric inspection. `pointsPer100SqYd` is stored because it is a RATE derived
 * from the roll's dimensions — a later width correction must not silently re-grade a roll
 * somebody already accepted or rejected.
 */
export const fabricInspections = pgTable(
  'fabric_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    grnId: uuid('grn_id')
      .notNull()
      .references(() => grns.id, { onDelete: 'cascade' }),
    rollId: uuid('roll_id').references(() => rolls.id, { onDelete: 'set null' }),

    /** { "1": n, "2": n, "3": n, "4": n } — defect counts by penalty band. */
    points4: jsonb('points_4').$type<Record<string, number>>().notNull().default({}),
    inspectedLengthYards: numeric('inspected_length_yards', { precision: 12, scale: 2 }).notNull(),
    widthInches: numeric('width_inches', { precision: 6, scale: 2 }).notNull(),

    totalPoints: integer('total_points').notNull(),
    pointsPer100SqYd: numeric('points_per_100_sq_yd', { precision: 8, scale: 2 }).notNull(),
    thresholdPer100SqYd: numeric('threshold_per_100_sq_yd', { precision: 8, scale: 2 }).notNull(),
    result: inspectionResultEnum('result').notNull(),

    inspectedBy: text('inspected_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fabric_inspections_company_grn_idx').on(t.companyId, t.grnId),
    index('fabric_inspections_roll_idx').on(t.rollId),
    index('fabric_inspections_company_result_idx').on(t.companyId, t.result),
    check('fabric_inspections_length_positive', sql`${t.inspectedLengthYards} > 0`),
    check('fabric_inspections_width_positive', sql`${t.widthInches} > 0`),
  ],
).enableRLS()

/**
 * The buyer's measurement chart. `tolPlus` and `tolMinus` are separate columns because
 * garment tolerances are asymmetric — +1/2" and −1/4" is a normal spec, and one tolerance
 * column would reject half the garments that should pass.
 */
export const measurementSpecs = pgTable(
  'measurement_specs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    styleCode: text('style_code').notNull(),
    version: integer('version').notNull().default(1),
    /** [{ name, spec, tolPlus, tolMinus }] per size, keyed by size in `sizeSpecs`. */
    points: jsonb('points').$type<unknown[]>().notNull().default([]),
    unit: text('unit').notNull().default('cm'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('measurement_specs_company_style_version_key').on(
      t.companyId,
      t.styleCode,
      t.version,
    ),
    index('measurement_specs_company_style_idx').on(t.companyId, t.styleCode),
    check('measurement_specs_version_positive', sql`${t.version} >= 1`),
  ],
).enableRLS()

export const measurementChecks = pgTable(
  'measurement_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    measurementSpecId: uuid('measurement_spec_id')
      .notNull()
      .references(() => measurementSpecs.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    sampledSize: text('sampled_size').notNull(),
    /** { pointName: value } as measured. */
    values: jsonb('values').$type<Record<string, string>>().notNull().default({}),
    /** Derived at capture and stored — the spec version may be superseded later. */
    outOfTolerance: jsonb('out_of_tolerance').$type<unknown[]>().notNull().default([]),
    /** Points the spec defines but nobody measured. A partial check is not a clean one. */
    missingPoints: text('missing_points').array().notNull().default(sql`'{}'::text[]`),
    result: inspectionResultEnum('result').notNull(),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('measurement_checks_company_order_idx').on(t.companyId, t.orderId, t.createdAt.desc()),
    index('measurement_checks_company_result_idx').on(t.companyId, t.result),
  ],
).enableRLS()

/**
 * ANSI/ASQ Z1.4, seeded and versioned. Global reference data with NO `company_id`: the
 * standard is the standard, and a per-tenant copy is a per-tenant chance to edit an
 * acceptance number. Buyer-specific strictness is expressed by which AQL LEVEL a buyer's
 * terms name, not by editing the table.
 */
export const aqlTables = pgTable(
  'aql_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** e.g. 'ansi-z1.4-2008'. Versioned so a historic verdict names its standard. */
    standard: text('standard').notNull(),
    inspectionLevel: text('inspection_level').notNull(),
    aqlLevel: text('aql_level').notNull(),
    lotFrom: integer('lot_from').notNull(),
    lotTo: integer('lot_to').notNull(),
    sampleSize: integer('sample_size').notNull(),
    accept: integer('accept').notNull(),
    reject: integer('reject').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('aql_tables_lookup_key').on(
      t.standard,
      t.inspectionLevel,
      t.aqlLevel,
      t.lotFrom,
    ),
    index('aql_tables_range_idx').on(t.standard, t.inspectionLevel, t.aqlLevel, t.lotFrom, t.lotTo),
    check('aql_tables_range_ordered', sql`${t.lotTo} >= ${t.lotFrom}`),
    check('aql_tables_reject_above_accept', sql`${t.reject} > ${t.accept}`),
  ],
)

/**
 * The verdict a shipment lives or dies on ⚖.
 *
 * The whole sampling plan is snapshotted here — sample size, both acceptance numbers, the
 * standard and the AQL levels used. `aql_tables` is versioned and buyer terms change; a
 * verdict that recomputes from today's table is one nobody can defend in six months.
 */
export const finalInspections = pgTable(
  'final_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderStyleId: uuid('order_style_id').references(() => orderStyles.id, {
      onDelete: 'set null',
    }),

    inspectionNo: text('inspection_no').notNull(),
    lotQty: integer('lot_qty').notNull(),

    /** ── the snapshotted plan ── */
    standard: text('standard').notNull(),
    inspectionLevel: text('inspection_level').notNull(),
    majorAql: text('major_aql').notNull(),
    minorAql: text('minor_aql').notNull(),
    sampleSize: integer('sample_size').notNull(),
    majorAccept: integer('major_accept').notNull(),
    minorAccept: integer('minor_accept').notNull(),
    hundredPercent: boolean('hundred_percent').notNull().default(false),

    /** ── what was found ── */
    criticalFound: integer('critical_found').notNull().default(0),
    majorFound: integer('major_found').notNull().default(0),
    minorFound: integer('minor_found').notNull().default(0),
    /** [{ code, severity, count }] — the breakdown behind the three totals. */
    defects: jsonb('defects').$type<unknown[]>().notNull().default([]),

    verdict: inspectionResultEnum('verdict').notNull(),
    /** Why it failed, in the checker's own terms. Empty on a pass. */
    failReasons: jsonb('fail_reasons').$type<unknown[]>().notNull().default([]),
    status: finalInspectionStatusEnum('status').notNull().default('draft'),

    inspectedAt: timestamp('inspected_at', { withTimezone: true }).notNull().defaultNow(),
    inspectedBy: text('inspected_by').references(() => users.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('final_inspections_company_no_key').on(t.companyId, t.inspectionNo),
    // "Has this order passed final?" — the shipment gate's lookup.
    index('final_inspections_company_order_idx').on(
      t.companyId,
      t.orderId,
      t.inspectedAt.desc(),
    ),
    index('final_inspections_company_verdict_idx').on(t.companyId, t.verdict, t.inspectedAt),
    check('final_inspections_lot_positive', sql`${t.lotQty} > 0`),
    check('final_inspections_sample_positive', sql`${t.sampleSize} > 0`),
    check(
      'final_inspections_counts_nonneg',
      sql`${t.criticalFound} >= 0 AND ${t.majorFound} >= 0 AND ${t.minorFound} >= 0`,
    ),
  ],
).enableRLS()

export const finalInspectionPhotos = pgTable(
  'final_inspection_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    finalInspectionId: uuid('final_inspection_id')
      .notNull()
      .references(() => finalInspections.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    caption: text('caption'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('final_inspection_photos_key').on(t.finalInspectionId, t.documentId),
    index('final_inspection_photos_company_idx').on(t.companyId, t.finalInspectionId),
  ],
).enableRLS()

export const thirdPartyInspections = pgTable(
  'third_party_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    agency: inspectionAgencyEnum('agency').notNull(),
    /** Free text when agency = 'other'. */
    agencyName: text('agency_name'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    result: inspectionResultEnum('result'),
    resultAt: timestamp('result_at', { withTimezone: true }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('third_party_inspections_company_order_idx').on(t.companyId, t.orderId),
    index('third_party_inspections_company_scheduled_idx').on(t.companyId, t.scheduledAt),
    check(
      'third_party_inspections_other_needs_name',
      sql`${t.agency} <> 'other' OR ${t.agencyName} IS NOT NULL`,
    ),
    // A result without a date is a result nobody can place in a timeline.
    check(
      'third_party_inspections_result_needs_date',
      sql`${t.result} IS NULL OR ${t.resultAt} IS NOT NULL`,
    ),
  ],
).enableRLS()
