/**
 * 1.1 Buyer Lead Desk ⚖
 *
 * Where a name at a trade fair becomes an account the factory ships to. `buyers` was
 * created early as a stub so 1.3 and 2.1 could have a real foreign key; this is the module
 * that fills it in.
 *
 * The two load-bearing decisions:
 *
 *  1. **`buyer_terms` is VERSIONED by `valid_from`, never edited.** An order placed in
 *     January is governed by January's terms. Editing a row in place would silently
 *     re-govern every order already taken under it — a different AQL level, a different
 *     shipping tolerance, applied retroactively to work already shipped.
 *  2. **Normalised name and domain are STORED, not computed on read.** They are what the
 *     trigram index searches, and an expression index over a function nobody can see is an
 *     index the next reader will accidentally invalidate.
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

export const leadSourceEnum = pgEnum('lead_source', [
  'fair',
  'referral',
  'buying_house',
  'inbound',
  'other',
])
export const leadStageEnum = pgEnum('lead_stage', [
  'new',
  'contacted',
  'sampling_talk',
  'negotiation',
  'won',
  'lost',
])
export const agentTypeEnum = pgEnum('agent_type', ['buying_house', 'individual'])
export const leadActivityKindEnum = pgEnum('lead_activity_kind', [
  'call',
  'email',
  'meeting',
  'note',
])
export const buyerStatusEnum = pgEnum('buyer_status', ['active', 'dormant', 'blacklisted'])
export const buyerContactRoleEnum = pgEnum('buyer_contact_role', [
  'merchandiser',
  'qa',
  'sourcing',
  'finance',
  'other',
])
export const paymentTermEnum = pgEnum('payment_term', ['lc', 'tt', 'dp'])
export const buyerDocumentKindEnum = pgEnum('buyer_document_kind', [
  'manual',
  'agreement',
  'coc',
  'other',
])

export const buyers = pgTable(
  'buyers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** Short code the merchandising team actually says out loud, e.g. "HM", "PRIMARK". */
    code: text('code').notNull(),
    name: text('name').notNull(),
    country: text('country'),

    /** The labels this buyer actually buys under. One account, several brands. */
    brands: text('brands').array().notNull().default(sql`'{}'::text[]`),
    website: text('website'),

    /**
     * Stored, not computed on read: this is what the trigram index searches. A duplicate
     * check that normalised on the fly could not use an index at all.
     */
    normalizedName: text('normalized_name'),
    normalizedDomain: text('normalized_domain'),

    status: buyerStatusEnum('status').notNull().default('active'),
    /** Kept alongside `status` because 1.3 and 2.1 already read it. */
    isActive: boolean('is_active').notNull().default(true),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('buyers_company_code_key').on(t.companyId, t.code),
    index('buyers_company_name_idx').on(t.companyId, t.name),
    index('buyers_company_status_idx').on(t.companyId, t.status),
    // A domain match is the strongest duplicate signal there is, so it gets a plain index
    // rather than relying on the trigram scan.
    index('buyers_company_domain_idx').on(t.companyId, t.normalizedDomain),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// The lead pipeline
// ─────────────────────────────────────────────────────────────────────────────

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    type: agentTypeEnum('type').notNull(),
    /** What they take. Money, so numeric — never a float. */
    commissionPct: numeric('commission_pct', { precision: 5, scale: 2 }),
    contacts: jsonb('contacts').$type<unknown[]>().notNull().default([]),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('agents_company_name_key').on(t.companyId, t.name),
    check(
      'agents_commission_range',
      sql`${t.commissionPct} IS NULL OR (${t.commissionPct} >= 0 AND ${t.commissionPct} <= 100)`,
    ),
  ],
).enableRLS()

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    source: leadSourceEnum('source').notNull(),
    companyName: text('company_name').notNull(),
    country: text('country'),
    website: text('website'),
    normalizedName: text('normalized_name'),
    normalizedDomain: text('normalized_domain'),

    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),

    stage: leadStageEnum('stage').notNull().default('new'),
    lostReason: text('lost_reason'),
    /** Set when the lead is converted. The link that makes conversion idempotent. */
    convertedBuyerId: uuid('converted_buyer_id').references(() => buyers.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('leads_company_stage_idx').on(t.companyId, t.stage, t.createdAt.desc()),
    index('leads_company_domain_idx').on(t.companyId, t.normalizedDomain),
    index('leads_company_agent_idx').on(t.companyId, t.agentId),
    uniqueIndex('leads_converted_buyer_key')
      .on(t.convertedBuyerId)
      .where(sql`converted_buyer_id IS NOT NULL`),
    // A lost lead must say why, or the loss taxonomy the desk is built on is empty.
    check('leads_lost_needs_reason', sql`${t.stage} <> 'lost' OR ${t.lostReason} IS NOT NULL`),
  ],
).enableRLS()

/**
 * Every actual contact. `quiet_since` is derived from the newest row here rather than from
 * `leads.updated_at`, because renaming a record is not talking to somebody — and a lead that
 * looks contacted because a field was edited is a lead nobody calls.
 */
export const leadActivities = pgTable(
  'lead_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),

    kind: leadActivityKindEnum('kind').notNull(),
    summary: text('summary').notNull(),
    occurredAt: date('occurred_at').notNull(),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The quiet-lead scan reads the newest activity per lead.
    index('lead_activities_lead_occurred_idx').on(t.leadId, t.occurredAt.desc()),
    index('lead_activities_company_occurred_idx').on(t.companyId, t.occurredAt.desc()),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// The buyer account
// ─────────────────────────────────────────────────────────────────────────────

export const buyerContacts = pgTable(
  'buyer_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    role: buyerContactRoleEnum('role').notNull(),
    email: text('email'),
    phone: text('phone'),
    isPrimary: boolean('is_primary').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one primary contact per buyer. Two "the" contacts is nobody's contact.
    uniqueIndex('buyer_contacts_primary_key')
      .on(t.buyerId)
      .where(sql`is_primary = true`),
    index('buyer_contacts_company_buyer_idx').on(t.companyId, t.buyerId),
  ],
).enableRLS()

/**
 * The buyer's commercial terms ⚖, versioned by `valid_from` and never edited.
 *
 * Every downstream gate reads from here — 8.1's shipping tolerance, 7.1's AQL level, 2.1's
 * nominated banks. Editing a version in place would retroactively re-govern orders already
 * shipped under the old one.
 */
export const buyerTerms = pgTable(
  'buyer_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id, { onDelete: 'cascade' }),

    version: integer('version').notNull(),
    /** The date this version began to govern. Terms are a calendar fact. */
    validFrom: date('valid_from').notNull(),

    payment: paymentTermEnum('payment').notNull(),
    incoterm: text('incoterm').notNull(),
    /** 8.1 reads this as the LC shipping tolerance band. */
    tolerancePct: numeric('tolerance_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    /** 7.1 reads this as the final-inspection AQL level. */
    aqlLevel: text('aql_level').notNull(),
    minorAqlLevel: text('minor_aql_level'),

    nominatedBanks: text('nominated_banks').array().notNull().default(sql`'{}'::text[]`),
    nominatedForwarders: text('nominated_forwarders').array().notNull().default(sql`'{}'::text[]`),
    nominatedLabs: text('nominated_labs').array().notNull().default(sql`'{}'::text[]`),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('buyer_terms_buyer_version_key').on(t.buyerId, t.version),
    // Two versions starting on the same day would make "which terms applied" a question of
    // row order, and it decides an AQL level.
    uniqueIndex('buyer_terms_buyer_valid_from_key').on(t.buyerId, t.validFrom),
    index('buyer_terms_company_buyer_idx').on(t.companyId, t.buyerId, t.validFrom.desc()),
    check('buyer_terms_version_positive', sql`${t.version} >= 1`),
  ],
).enableRLS()

/**
 * What this buyer demands, extracted from their manual. Each row carries the page it came
 * from, so a requirement somebody disputes can be checked against the document rather than
 * argued about.
 */
export const buyerRequirements = pgTable(
  'buyer_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id, { onDelete: 'cascade' }),

    category: text('category').notNull(),
    text: text('text').notNull(),
    sourceDocumentId: uuid('source_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    sourcePage: integer('source_page'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('buyer_requirements_company_buyer_idx').on(t.companyId, t.buyerId, t.category),
  ],
).enableRLS()

export const buyerDocuments = pgTable(
  'buyer_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    kind: buyerDocumentKindEnum('kind').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('buyer_documents_key').on(t.buyerId, t.documentId),
    index('buyer_documents_company_buyer_idx').on(t.companyId, t.buyerId, t.kind),
  ],
).enableRLS()
