/**
 * 11.2 Owner Dashboard & Analytics.
 *
 * Three tables, and a note about where the writes live.
 *
 * CLAUDE.md rule 9 makes `modules/analytics` read-only, enforced by the
 * `analytics-no-writes` lint rule. The exceptions feed is nonetheless "materialized,
 * refreshed by jobs" (brief), which is a write. The two are reconciled by putting the
 * refresher in `src/worker/processors/exceptions-feed.ts`, alongside the outbox relay and
 * the other derivations, and leaving this module with reads only. Declaring a table is not
 * writing to one.
 *
 * The feed is a TABLE and not a materialized view for one reason that matters more than the
 * convenience: Postgres does not apply row-level security to materialized views. In a system
 * whose entire tenancy model is two walls, a cross-tenant view of every factory's exceptions
 * is not a trade worth making for a refresh command.
 *
 * `since` is why the feed is persisted at all. Everything else in it can be recomputed on
 * demand, but "this LC conflict has been open for nine days" cannot — and that is the part
 * an owner acts on.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, users } from '@/db/schema/core'

export const exceptionKindEnum = pgEnum('exception_kind', [
  'lc_conflict',
  'tna_risk',
  'cap_critical',
  'runrate_miss',
  'approval_waiting',
  'payroll_anomaly',
])

export const exceptionSeverityEnum = pgEnum('exception_severity', ['low', 'medium', 'high'])
export const exportPeriodEnum = pgEnum('export_period', ['daily', 'weekly', 'monthly'])
export const exportFormatEnum = pgEnum('export_format', ['csv', 'xlsx', 'pdf'])

export const exceptionsFeed = pgTable(
  'exceptions_feed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    kind: exceptionKindEnum('kind').notNull(),
    /** The row this is about — an LC, a milestone, a CAP, a pending change. */
    ref: uuid('ref').notNull(),
    /** Enough to render the row without joining six modules. */
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),

    /**
     * When it was FIRST seen, preserved across every refresh. The age is what makes an
     * exception act-on-able: an LC conflict open for nine days is a different thing from one
     * that appeared this morning, and recomputing this on each run would erase the
     * difference every five minutes.
     */
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
    severity: exceptionSeverityEnum('severity').notNull(),

    /** Last refresh that still saw it. Together with `resolvedAt`, the whole history. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when a refresh no longer finds it. Kept, not deleted — it cleared, and when. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    // One live row per thing. Two would let the same conflict be counted twice and would
    // make `since` depend on which one a query happened to read.
    uniqueIndex('exceptions_feed_company_kind_ref_key').on(t.companyId, t.kind, t.ref),
    index('exceptions_feed_company_open_idx')
      .on(t.companyId, t.severity, t.since)
      .where(sql`resolved_at IS NULL`),
    check('exceptions_feed_resolved_after_since', sql`${t.resolvedAt} IS NULL OR ${t.resolvedAt} >= ${t.since}`),
  ],
).enableRLS()

export const savedReports = pgTable(
  'saved_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    /** Which aggregation, e.g. `order_book`, `efficiency_trend`, `buyer_scorecards`. */
    kind: text('kind').notNull(),
    /** Period, buyer filter, line filter — whatever that aggregation takes. */
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('saved_reports_company_name_key').on(t.companyId, t.name)],
).enableRLS()

export const scheduledExports = pgTable(
  'scheduled_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    savedReportId: uuid('saved_report_id')
      .notNull()
      .references(() => savedReports.id, { onDelete: 'cascade' }),

    period: exportPeriodEnum('period').notNull(),
    format: exportFormatEnum('format').notNull(),
    /** Plain addresses. No FK to users: a buyer's merchandiser is not one. */
    recipients: text('recipients').array().notNull(),

    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('scheduled_exports_company_next_idx').on(t.companyId, t.nextRunAt),
    // An export with nobody to send it to is a job that runs forever and reaches no one.
    check('scheduled_exports_has_recipients', sql`array_length(${t.recipients}, 1) >= 1`),
  ],
).enableRLS()
