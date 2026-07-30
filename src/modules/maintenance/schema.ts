/**
 * 9.1 Machines & Tickets.
 *
 * The floor-facing half of maintenance. Two things here are shaped by how a sewing floor
 * actually works rather than by how an asset register usually looks:
 *
 *  1. **A ticket is opened by the system, not by a person.** When 6.1 records a machine
 *     stoppage, a supervisor with a stopped line does not go and file paperwork. The
 *     downtime event raises the ticket and links back, which is why `downtime_id` is unique
 *     — one stoppage is one ticket, however many times the event is redelivered.
 *  2. **`downtime_costs` stores the RATE it used.** The taka figure is minutes × the value
 *     of a line-minute, and that value changes with wages and with the styles being run. A
 *     stored figure with no stored rate cannot be reproduced or argued with six months
 *     later, which is the only state worse than not having the figure at all.
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

import { companies, users } from '@/db/schema/core'
import { lines } from '@/modules/planning/schema'

export const pmCadenceEnum = pgEnum('pm_cadence', ['daily', 'weekly', 'monthly'])
export const ticketSourceEnum = pgEnum('ticket_source', ['downtime_auto', 'manual'])
/**
 * `line_down` is not a severity somebody picks — it is what an automatic ticket from a
 * machine stoppage always is, because the line is, in fact, down.
 */
export const ticketPriorityEnum = pgEnum('ticket_priority', ['line_down', 'high', 'normal'])
export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'claimed',
  'resolved',
  'cancelled',
])

export const machines = pgTable(
  'machines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** Free text on purpose: a factory's machine types are its own vocabulary. */
    machineType: text('machine_type').notNull(),
    brand: text('brand'),
    model: text('model'),
    /** The number stencilled on the machine. Unique per company where it is known. */
    serial: text('serial'),
    purchasedAt: date('purchased_at'),

    /** Where it is now. History below records where it has been. */
    lineId: uuid('line_id').references(() => lines.id, { onDelete: 'set null' }),
    /**
     * `[{ lineId, from, to }]` — appended, never rewritten. A machine that keeps being
     * moved is itself a finding, and the current `line_id` alone cannot show that.
     */
    assignmentHistory: jsonb('assignment_history').$type<unknown[]>().notNull().default([]),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('machines_company_serial_key')
      .on(t.companyId, t.serial)
      .where(sql`serial IS NOT NULL`),
    index('machines_company_line_idx').on(t.companyId, t.lineId),
    index('machines_company_type_idx').on(t.companyId, t.machineType),
  ],
).enableRLS()

/**
 * A checklist and a cadence, per machine TYPE rather than per machine.
 *
 * Maintenance is defined for a kind of machine — every overlock gets the same monthly
 * service. Per-machine schedules would be four hundred rows saying the same thing, and the
 * first one somebody forgot to create would be a machine silently never serviced.
 */
export const pmSchedules = pgTable(
  'pm_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    machineType: text('machine_type').notNull(),
    cadence: pmCadenceEnum('cadence').notNull(),
    /** `[{ step, note? }]` — what the mechanic actually does. */
    checklist: jsonb('checklist').$type<unknown[]>().notNull().default([]),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pm_schedules_company_type_cadence_key').on(t.companyId, t.machineType, t.cadence),
  ],
).enableRLS()

export const pmCompletions = pgTable(
  'pm_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => pmSchedules.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),

    completedOn: date('completed_on').notNull(),
    /** `[{ step, ok, note? }]` — which checks were actually made. */
    checked: jsonb('checked').$type<unknown[]>().notNull().default([]),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One completion per machine per schedule per day. A second is a double-tap on a
    // handset, and it would make the due-list think a machine was serviced twice.
    uniqueIndex('pm_completions_machine_schedule_day_key').on(
      t.machineId,
      t.scheduleId,
      t.completedOn,
    ),
    index('pm_completions_company_machine_idx').on(t.companyId, t.machineId, t.completedOn),
  ],
).enableRLS()

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id').references(() => machines.id, { onDelete: 'set null' }),
    /** The stoppage that raised it. No FK: `downtimes` is 6.1's table (rule 11). */
    downtimeId: uuid('downtime_id'),
    lineId: uuid('line_id').references(() => lines.id, { onDelete: 'set null' }),

    source: ticketSourceEnum('source').notNull(),
    priority: ticketPriorityEnum('priority').notNull(),
    status: ticketStatusEnum('status').notNull().default('open'),

    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    claimedBy: text('claimed_by').references(() => users.id, { onDelete: 'set null' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    /**
     * `[{ partId, name, qty, shortfall }]`. `shortfall` is how many more were used than the
     * store believed it had — see `resolveTicket` for why that is recorded rather than
     * refused.
     */
    partsUsed: jsonb('parts_used').$type<unknown[]>().notNull().default([]),
    notes: text('notes'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One stoppage, one ticket — however many times the outbox redelivers the event.
    uniqueIndex('tickets_downtime_key')
      .on(t.companyId, t.downtimeId)
      .where(sql`downtime_id IS NOT NULL`),
    // The board a mechanic watches: open work, worst first.
    index('tickets_company_status_idx').on(t.companyId, t.status, t.priority, t.reportedAt),
    index('tickets_company_machine_idx').on(t.companyId, t.machineId, t.reportedAt),
    check(
      'tickets_claimed_has_claimer',
      sql`${t.status} <> 'claimed' OR ${t.claimedBy} IS NOT NULL`,
    ),
    check(
      'tickets_resolved_has_time',
      sql`${t.status} <> 'resolved' OR ${t.resolvedAt} IS NOT NULL`,
    ),
  ],
).enableRLS()

export const spareParts = pgTable(
  'spare_parts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    code: text('code').notNull(),
    name: text('name').notNull(),
    onHand: integer('on_hand').notNull().default(0),
    /** The reorder point. At it, not below it, is already time to order. */
    minLevel: integer('min_level').notNull().default(0),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('spare_parts_company_code_key').on(t.companyId, t.code),
    index('spare_parts_company_low_idx').on(t.companyId, t.onHand),
    // Enforced in the database, not only in `reorderList`. Negative stock is a counting
    // error and every figure derived from it is wrong in a way that looks plausible.
    check('spare_parts_on_hand_nonneg', sql`${t.onHand} >= 0`),
    check('spare_parts_min_level_nonneg', sql`${t.minLevel} >= 0`),
  ],
).enableRLS()

/**
 * Derived monthly ⚖-adjacent: what machine stoppages cost, per machine.
 *
 * `valuePerMinute` and its currency are stored WITH the figure. The value of a line-minute
 * moves with the gazette wage and with what the line is running, so a loss figure that only
 * kept its result cannot be reproduced — and an unreproducible taka figure in a monthly
 * report is one nobody can defend when it is questioned.
 */
export const downtimeCosts = pgTable(
  'downtime_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),

    /** First day of the month this covers. */
    forMonth: date('for_month').notNull(),
    minutes: integer('minutes').notNull(),

    valuePerMinute: numeric('value_per_minute', { precision: 14, scale: 2 }).notNull(),
    estimatedLoss: numeric('estimated_loss', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('BDT'),

    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('downtime_costs_machine_month_key').on(t.machineId, t.forMonth),
    index('downtime_costs_company_month_idx').on(t.companyId, t.forMonth),
    check('downtime_costs_minutes_nonneg', sql`${t.minutes} >= 0`),
    check('downtime_costs_currency_iso', sql`char_length(${t.currency}) = 3`),
    // A stored loss with no rate behind it cannot be reproduced or argued with.
    check('downtime_costs_rate_positive', sql`${t.valuePerMinute} > 0`),
  ],
).enableRLS()
