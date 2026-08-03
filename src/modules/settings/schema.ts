/**
 * X.3 Settings & Admin ⚖
 *
 * Three tables, and each one exists to remove a specific ambiguity:
 *
 *  1. **`policy_settings`** — one row per (company, module), holding only the OVERRIDES.
 *     Not the whole resolved policy: storing a full snapshot means a default the factory
 *     never touched gets frozen at whatever it was the day they signed up, and improving a
 *     default would then not reach anybody. A sparse override row is the only shape where
 *     "we never configured that" and "we set it to exactly the default" stay distinguishable.
 *  2. **`company_profiles`** — the legal identity that goes on documents. One row per
 *     company, keyed by company, because a factory has one of these and a table that allowed
 *     two would eventually have two disagreeing ones.
 *  3. **`module_toggles`** — a module a factory does not use. Absence means enabled: a
 *     factory that never opens this screen must not find half its ERP switched off.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
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

/**
 * Woven units buy or import their shell fabric; knit units buy knit fabric;
 * knit-composite units knit their own from yarn and dye it in-house. The three
 * have genuinely different material chains, so this drives module visibility.
 */
export const factoryTypeEnum = pgEnum('factory_type', ['woven', 'knit', 'knit-composite'])

/**
 * A company's policy overrides ⚖.
 *
 * `overrides` holds ONLY what somebody changed. See the note above on why this is not a
 * resolved snapshot.
 */
export const policySettings = pgTable(
  'policy_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    moduleId: text('module_id').notNull(),
    /** Sparse: only the keys a human actually set. */
    overrides: jsonb('overrides').$type<Record<string, unknown>>().notNull().default({}),

    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('policy_settings_company_module_key').on(t.companyId, t.moduleId),
    index('policy_settings_company_idx').on(t.companyId),
  ],
).enableRLS()

/** The legal identity that goes on an invoice, a UD and a bank submission. */
export const companyProfiles = pgTable(
  'company_profiles',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, { onDelete: 'cascade' }),

    legalName: text('legal_name').notNull(),
    addressLines: text('address_lines').array().notNull().default(sql`'{}'::text[]`),
    country: text('country').notNull().default('BD'),

    /** Bangladeshi tax identifiers. They appear on export documents by law. */
    binNumber: text('bin_number'),
    tinNumber: text('tin_number'),
    /** Bonded warehouse licence — 2.2's UDs are drawn against it. */
    bondLicenceNo: text('bond_licence_no'),

    /**
     * What this unit actually makes. It decides which modules EXIST for the
     * factory, not merely how they render: a knit unit has no bonded shell
     * fabric and therefore no UD workbench, and only a composite unit dyes its
     * own greige. Defaulting to woven matches the majority of export units and
     * keeps an unconfigured factory seeing the fuller set rather than a
     * silently narrowed one.
     */
    factoryType: factoryTypeEnum('factory_type').notNull().default('woven'),

    /** Everything in this system is a calendar fact in the factory's own timezone. */
    timezone: text('timezone').notNull().default('Asia/Dhaka'),
    locale: text('locale').notNull().default('en'),
    /** Buyer-facing. Local costs stay in `local_currency`. */
    baseCurrency: text('base_currency').notNull().default('USD'),
    localCurrency: text('local_currency').notNull().default('BDT'),

    logoDocumentId: uuid('logo_document_id'),

    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('company_profiles_base_currency_iso', sql`char_length(${t.baseCurrency}) = 3`),
    check('company_profiles_local_currency_iso', sql`char_length(${t.localCurrency}) = 3`),
  ],
).enableRLS()

/**
 * Modules a factory has switched off.
 *
 * Absence means ENABLED. A factory that never opens the settings screen must not discover
 * half its ERP disabled, so the table records the exception rather than the state.
 */
export const moduleToggles = pgTable(
  'module_toggles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    moduleId: text('module_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** Why. A module switched off with no reason gets switched back on by the next person. */
    note: text('note'),

    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('module_toggles_company_module_key').on(t.companyId, t.moduleId),
    index('module_toggles_company_idx').on(t.companyId),
  ],
).enableRLS()
