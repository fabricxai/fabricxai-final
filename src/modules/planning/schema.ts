/**
 * 4.1 Capacity & Line Planning.
 *
 * Owns the factory's physical shape — units, floors, lines — and everything that decides
 * what can be sewn when. `lines` lives here rather than in 6.1 because it is master data
 * a planner sets up; module 6.1 records output AGAINST a line but never creates one
 * (CLAUDE.md rule 11, one writer module per table). The table definition moved here as a
 * pure refactor: identical SQL, no migration, only the ownership boundary changed.
 *
 * The load-bearing idea: capacity is measured in EARNABLE minutes, not clock minutes.
 * Planning against clock time assumes 100% efficiency, which no sewing line has ever
 * achieved, and it is the most common way a factory over-commits.
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

import { companies, users } from '@/db/schema/core'
import { orders, orderStyles } from '@/modules/orders/schema'

export const smvSourceEnum = pgEnum('smv_source', ['ie_study', 'estimate'])
export const allocationStatusEnum = pgEnum('allocation_status', ['planned', 'active', 'done'])
export const scenarioStatusEnum = pgEnum('scenario_status', ['draft', 'applied', 'discarded'])

// ─────────────────────────────────────────────────────────────────────────────
// The factory's shape
// ─────────────────────────────────────────────────────────────────────────────

export const factoryUnits = pgTable(
  'factory_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('factory_units_company_code_key').on(t.companyId, t.code)],
).enableRLS()

export const floors = pgTable(
  'floors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    factoryUnitId: uuid('factory_unit_id')
      .notNull()
      .references(() => factoryUnits.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('floors_company_code_key').on(t.companyId, t.code),
    index('floors_company_unit_idx').on(t.companyId, t.factoryUnitId),
  ],
).enableRLS()

/**
 * A sewing line. Master data — created once at setup, then everything else refers to it.
 * `floor_id` is nullable so a factory that has not mapped its floors yet still has lines.
 */
export const lines = pgTable(
  'lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    code: text('code').notNull(),
    name: text('name').notNull(),
    /** Nominal head count; the day plan carries what is actually rostered. */
    capacityManpower: integer('capacity_manpower'),
    machinesCount: integer('machines_count'),
    floorId: uuid('floor_id').references(() => floors.id, { onDelete: 'set null' }),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lines_company_code_key').on(t.companyId, t.code),
    index('lines_company_idx').on(t.companyId),
    index('lines_company_floor_idx').on(t.companyId, t.floorId),
  ],
).enableRLS()

/**
 * What a line is actually available for on a given date — the shift, minus maintenance,
 * minus the public holidays a fixed 480-minute assumption would miss.
 */
export const lineCalendars = pgTable(
  'line_calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => lines.id, { onDelete: 'cascade' }),

    calendarDate: date('calendar_date').notNull(),
    shiftMinutes: integer('shift_minutes').notNull().default(480),
    plannedDowntimeMinutes: integer('planned_downtime_minutes').notNull().default(0),
    manpower: integer('manpower'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('line_calendars_line_date_key').on(t.lineId, t.calendarDate),
    index('line_calendars_company_date_idx').on(t.companyId, t.calendarDate),
    check(
      'line_calendars_downtime_within_shift',
      sql`${t.plannedDowntimeMinutes} >= 0 AND ${t.plannedDowntimeMinutes} < ${t.shiftMinutes}`,
    ),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// What the plan is built from
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard minute values. `source` matters more than it looks: an IE study and a
 * merchandiser's estimate are both numbers, and only one of them should be planned
 * against without saying so.
 */
export const smvRecords = pgTable(
  'smv_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    styleCode: text('style_code').notNull(),
    smv: numeric('smv', { precision: 8, scale: 2 }).notNull(),
    source: smvSourceEnum('source').notNull().default('estimate'),
    measuredAt: date('measured_at'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The newest study for a style wins; older ones stay for the variance history.
    index('smv_records_company_style_idx').on(t.companyId, t.styleCode, t.measuredAt.desc()),
    check('smv_records_positive', sql`${t.smv} > 0`),
  ],
).enableRLS()

/**
 * How fast a product type comes up to speed. Day one of a new style is often half of
 * day ten, and planning at the steady state is how a ship date gets missed in week one.
 */
export const learningCurves = pgTable(
  'learning_curves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    productType: text('product_type').notNull(),
    dayIndex: integer('day_index').notNull(),
    efficiencyPct: numeric('efficiency_pct', { precision: 6, scale: 2 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('learning_curves_type_day_key').on(t.companyId, t.productType, t.dayIndex),
    check('learning_curves_day_positive', sql`${t.dayIndex} >= 1`),
    check(
      'learning_curves_efficiency_range',
      sql`${t.efficiencyPct} > 0 AND ${t.efficiencyPct} <= 200`,
    ),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// The plan
// ─────────────────────────────────────────────────────────────────────────────

export const allocations = pgTable(
  'allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /**
     * Which style of the order is on the line. Nullable, and resolved from the order when
     * it has exactly one style — but a multi-style order MUST name it, because SMV is a
     * property of a style and there is no such thing as the SMV of an order.
     */
    orderStyleId: uuid('order_style_id').references(() => orderStyles.id, {
      onDelete: 'cascade',
    }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => lines.id, { onDelete: 'restrict' }),

    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** date → qty. The shape a Gantt renders and the day-close compares against. */
    plannedDaily: jsonb('planned_daily').$type<Record<string, number>>().notNull().default({}),

    status: allocationStatusEnum('status').notNull().default('planned'),
    /** Violations accepted when this was committed — a planner overrode them knowingly. */
    acceptedViolations: jsonb('accepted_violations').$type<unknown[]>().notNull().default([]),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The board: what is on this line over this window.
    index('allocations_company_line_dates_idx').on(t.companyId, t.lineId, t.startDate),
    index('allocations_company_order_idx').on(t.companyId, t.orderId),
    index('allocations_company_status_idx').on(t.companyId, t.status, t.startDate),
    check('allocations_range_ordered', sql`${t.endDate} >= ${t.startDate}`),
  ],
).enableRLS()

/**
 * A what-if. Forked from a point in time, edited freely, then applied through
 * `pending_changes` — so a planner can try five arrangements without any of them
 * becoming real until somebody approves one.
 */
export const scenarios = pgTable(
  'scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    baseSnapshotAt: timestamp('base_snapshot_at', { withTimezone: true }).notNull().defaultNow(),
    draftAllocations: jsonb('draft_allocations').$type<unknown[]>().notNull().default([]),
    status: scenarioStatusEnum('status').notNull().default('draft'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scenarios_company_name_key').on(t.companyId, t.name),
    index('scenarios_company_status_idx').on(t.companyId, t.status),
  ],
).enableRLS()
