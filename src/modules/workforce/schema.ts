/**
 * 10.1 Workforce & Wage Engine ⚖ 🔒
 *
 * **The gazette is data, not code.** Bangladesh minimum wages are set by government
 * notification and revised without warning. A factory uploads its own gazette as a
 * versioned dataset, activates it, and every payroll run pins the version it used. No
 * rate is ever hardcoded in this repo: the system works for a factory whose gazette we
 * have never seen, and a wage revision is an upload rather than a deploy.
 *
 * That pinning is also what makes a run reproducible. "Recompute June and show me" has to
 * give the same answer in a year's time, after two gazette revisions — so the run holds
 * both the gazette id and a snapshot of the factory's policy rules.
 *
 * 🔒 Payroll tables are the most sensitive in the system. Access is hr + owner only,
 * enforced in the service layer with bodyless 403s, and every read of `payroll_lines` is
 * audited (CLAUDE.md rule 9, brief §Roles).
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

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const gazetteStatusEnum = pgEnum('gazette_status', ['draft', 'active', 'superseded'])

export const workerStatusEnum = pgEnum('worker_status', ['active', 'on_leave', 'exited'])

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'leave',
  'holiday',
])

export const attendanceSourceEnum = pgEnum('attendance_source', ['device', 'manual'])

export const leaveKindEnum = pgEnum('leave_kind', ['earned', 'casual', 'sick', 'maternity'])

export const payrollRunStatusEnum = pgEnum('payroll_run_status', [
  'draft',
  'computed',
  'approved',
  'disbursed',
])

export const disbursementTypeEnum = pgEnum('disbursement_type', ['bank', 'bkash', 'nagad', 'cash'])

// ─────────────────────────────────────────────────────────────────────────────
// The gazette
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One uploaded wage gazette. The parent of its grade rows so a whole revision can be
 * uploaded, reviewed and activated as a unit — activating half a gazette would pay some
 * grades at new rates and some at old ones, in the same run.
 *
 * The brief lists `gazette_version` flat on `wage_grades`; splitting the parent out is a
 * deliberate deviation, recorded in docs/STUBS.md, because upload-then-activate is the
 * whole point of making this data.
 */
export const wageGazettes = pgTable(
  'wage_gazettes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** The factory's label for this revision, e.g. '2023-minimum-wage-board'. */
    version: text('version').notNull(),
    /** First wage period this gazette applies to. */
    effectiveFrom: date('effective_from').notNull(),

    status: gazetteStatusEnum('status').notNull().default('draft'),
    /** The scanned notification. Every rate below should be checkable against it. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    notes: text('notes'),

    activatedBy: text('activated_by').references(() => users.id, { onDelete: 'set null' }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wage_gazettes_company_version_key').on(t.companyId, t.version),
    // "Which gazette applies to this period?" — the lookup every run starts with.
    index('wage_gazettes_company_effective_idx').on(t.companyId, t.status, t.effectiveFrom),
  ],
).enableRLS()

/**
 * One grade's components, as printed in the gazette. Amounts are decimal strings; a float
 * here is a wrong payslip for everyone on that grade.
 */
export const wageGrades = pgTable(
  'wage_grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    gazetteId: uuid('gazette_id')
      .notNull()
      .references(() => wageGazettes.id, { onDelete: 'cascade' }),

    /** As the gazette names it — '1'…'7', or whatever a future revision uses. */
    grade: text('grade').notNull(),

    basic: numeric('basic', { precision: 14, scale: 2 }).notNull(),
    houseRent: numeric('house_rent', { precision: 14, scale: 2 }).notNull().default('0'),
    medical: numeric('medical', { precision: 14, scale: 2 }).notNull().default('0'),
    transport: numeric('transport', { precision: 14, scale: 2 }).notNull().default('0'),
    food: numeric('food', { precision: 14, scale: 2 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wage_grades_gazette_grade_key').on(t.gazetteId, t.grade),
    index('wage_grades_company_gazette_idx').on(t.companyId, t.gazetteId),
    check('wage_grades_basic_positive', sql`${t.basic} > 0`),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

export const workers = pgTable(
  'workers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    employeeNo: text('employee_no').notNull(),
    name: text('name').notNull(),
    /** Bangla name. The payslip leads in Bangla; the office reads the English one. */
    nameBn: text('name_bn'),
    photoDocumentId: uuid('photo_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),

    designation: text('designation'),
    /** The gazette grade this worker is paid on. Resolved against the active gazette. */
    grade: text('grade').notNull(),
    section: text('section'),
    /** No FK yet: `lines` belongs to module 4.1 — see docs/STUBS.md. */
    lineId: uuid('line_id'),

    joinDate: date('join_date').notNull(),
    exitDate: date('exit_date'),

    /** How this worker is paid: bank account, mobile wallet, or cash. */
    disbursementType: disbursementTypeEnum('disbursement_type').notNull().default('cash'),
    disbursementRef: text('disbursement_ref'),

    status: workerStatusEnum('status').notNull().default('active'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('workers_company_employee_no_key').on(t.companyId, t.employeeNo),
    index('workers_company_status_idx').on(t.companyId, t.status),
    index('workers_company_grade_idx').on(t.companyId, t.grade),
    index('workers_company_line_idx').on(t.companyId, t.lineId),
  ],
).enableRLS()

export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workers.id, { onDelete: 'cascade' }),

    date: date('date').notNull(),
    inAt: timestamp('in_at', { withTimezone: true }),
    outAt: timestamp('out_at', { withTimezone: true }),

    status: attendanceStatusEnum('status').notNull(),
    source: attendanceSourceEnum('source').notNull().default('device'),
    /** Set when the device data needs a human: missed punch, late, in/out mismatch. */
    exception: text('exception'),

    /** Overtime for the day, in hours. numeric(6,2) — part hours are normal. */
    otHours: numeric('ot_hours', { precision: 6, scale: 2 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per worker per day — a device importer that runs twice must not double.
    uniqueIndex('attendance_worker_date_key').on(t.workerId, t.date),
    // The payroll gather: a company's month.
    index('attendance_company_date_idx').on(t.companyId, t.date),
    check('attendance_ot_hours_positive', sql`${t.otHours} >= 0`),
  ],
).enableRLS()

export const leaves = pgTable(
  'leaves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workers.id, { onDelete: 'cascade' }),

    kind: leaveKindEnum('kind').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    /** Maternity is statutory paid leave; unpaid leave reduces the payable month. */
    isPaid: boolean('is_paid').notNull().default(true),

    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('leaves_company_worker_idx').on(t.companyId, t.workerId, t.fromDate),
    index('leaves_company_range_idx').on(t.companyId, t.fromDate, t.toDate),
    check('leaves_range_ordered', sql`${t.toDate} >= ${t.fromDate}`),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// Payroll ⚖ 🔒
// ─────────────────────────────────────────────────────────────────────────────

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** `YYYY-MM`. */
    period: text('period').notNull(),

    /**
     * The gazette this run was computed against, pinned. A later revision must not
     * silently change what June paid.
     */
    gazetteId: uuid('gazette_id')
      .notNull()
      .references(() => wageGazettes.id, { onDelete: 'restrict' }),
    /** Factory policy as at compute time — the other half of reproducibility. */
    rulesSnapshot: jsonb('rules_snapshot').$type<Record<string, unknown>>().notNull(),

    status: payrollRunStatusEnum('status').notNull().default('draft'),

    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    disbursedAt: timestamp('disbursed_at', { withTimezone: true }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One run per period. Recomputing replaces its lines; it does not make a second run.
    uniqueIndex('payroll_runs_company_period_key').on(t.companyId, t.period),
    index('payroll_runs_company_status_idx').on(t.companyId, t.status),
    check('payroll_runs_period_format', sql`${t.period} ~ '^\\d{4}-\\d{2}$'`),
  ],
).enableRLS()

export const payrollLines = pgTable(
  'payroll_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => payrollRuns.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workers.id, { onDelete: 'restrict' }),

    grade: text('grade').notNull(),
    payableDays: integer('payable_days').notNull(),

    /** basic / houseRent / medical / transport / food, as computed. */
    components: jsonb('components').$type<Record<string, string>>().notNull(),

    otHours: numeric('ot_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    otAmount: numeric('ot_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    attendanceBonus: numeric('attendance_bonus', { precision: 14, scale: 2 }).notNull().default('0'),
    festivalBonus: numeric('festival_bonus', { precision: 14, scale: 2 }).notNull().default('0'),

    deductions: jsonb('deductions').$type<unknown[]>().notNull().default([]),
    totalDeductions: numeric('total_deductions', { precision: 14, scale: 2 }).notNull().default('0'),

    gross: numeric('gross', { precision: 14, scale: 2 }).notNull(),
    net: numeric('net', { precision: 14, scale: 2 }).notNull(),
    /** Deductions that would have driven net below zero. Carried, never netted off. */
    deductionCarryForward: numeric('deduction_carry_forward', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),

    currency: text('currency').notNull().default('BDT'),
    /** Anomalies are flagged, not withheld — a supervisor decides, not the system. */
    flags: jsonb('flags').$type<unknown[]>().notNull().default([]),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payroll_lines_run_worker_key').on(t.runId, t.workerId),
    index('payroll_lines_company_run_idx').on(t.companyId, t.runId),
    index('payroll_lines_company_worker_idx').on(t.companyId, t.workerId),
    // The flagged-lines review screen.
    index('payroll_lines_flags_idx').using('gin', t.flags),
    check('payroll_lines_net_not_negative', sql`${t.net} >= 0`),
    check('payroll_lines_currency_iso', sql`char_length(${t.currency}) = 3`),
  ],
).enableRLS()

/** The pro-rata rules a festival bonus was paid under, snapshotted per festival. */
export const festivalBonusRuns = pgTable(
  'festival_bonus_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    festival: text('festival').notNull(),
    period: text('period').notNull(),
    rulesSnapshot: jsonb('rules_snapshot').$type<Record<string, unknown>>().notNull(),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('festival_bonus_runs_company_festival_key').on(t.companyId, t.festival, t.period)],
).enableRLS()

export const skillMatrix = pgTable(
  'skill_matrix',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workers.id, { onDelete: 'cascade' }),

    operation: text('operation').notNull(),
    /** a / b / c — how well this worker runs this operation. Drives line balancing. */
    skillGrade: text('skill_grade').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('skill_matrix_worker_operation_key').on(t.workerId, t.operation),
    index('skill_matrix_company_operation_idx').on(t.companyId, t.operation, t.skillGrade),
    check('skill_matrix_grade_valid', sql`${t.skillGrade} IN ('a','b','c')`),
  ],
).enableRLS()
