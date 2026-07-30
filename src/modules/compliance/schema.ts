/**
 * 10.2 Compliance & Audit ⚖
 *
 * Five tables that together answer the one question a buyer's compliance team asks: show me
 * that what the last audit found was actually fixed.
 *
 * Two shapes here are deliberate.
 *
 * **`caps.closure_evidence` is a jsonb array, not a nullable document id.** A corrective
 * action closes on a photograph AND an electrician's certificate AND a re-inspection note,
 * and a single-document column would silently keep the last one attached. The constraint that
 * matters — a critical finding cannot close on a note alone — is in the service, because it
 * depends on the finding's severity rather than on this row.
 *
 * **`caps.milestones` exists for multi-year RSC remediation.** A structural finding on a
 * building is not a thirty-day fix; it is a schedule with dates a buyer signs off, and
 * squeezing it into one deadline would make every such CAP permanently overdue.
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

import { companies, documents, users } from '@/db/schema/core'

export const auditRegimeEnum = pgEnum('audit_regime', [
  'rsc',
  'bsci',
  'sedex',
  'buyer',
  'government',
])
export const findingSeverityEnum = pgEnum('finding_severity', [
  'critical',
  'major',
  'minor',
  'observation',
])
export const capStatusEnum = pgEnum('cap_status', [
  'open',
  'in_progress',
  'evidence_submitted',
  'closed',
])

export const audits = pgTable(
  'audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    regime: auditRegimeEnum('regime').notNull(),
    auditor: text('auditor').notNull(),
    auditedOn: date('audited_on').notNull(),
    /** The report itself. Its absence is a gap the pack export names out loud. */
    reportDocumentId: uuid('report_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    /** Some regimes score, some do not. Never invented when the report has none. */
    score: numeric('score', { precision: 6, scale: 2 }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audits_company_regime_idx').on(t.companyId, t.regime, t.auditedOn.desc()),
    index('audits_company_date_idx').on(t.companyId, t.auditedOn.desc()),
  ],
).enableRLS()

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),

    severity: findingSeverityEnum('severity').notNull(),
    text: text('text').notNull(),
    /** `[{ documentId?, page?, note? }]` — what the auditor pointed at. */
    evidence: jsonb('evidence').$type<unknown[]>().notNull().default([]),
    /** Where in the report this came from, for click-to-source on a drafted batch. */
    sourcePage: integer('source_page'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('findings_company_audit_idx').on(t.companyId, t.auditId, t.severity),
    index('findings_company_severity_idx').on(t.companyId, t.severity),
  ],
).enableRLS()

export const caps = pgTable(
  'caps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),

    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    deadline: date('deadline').notNull(),
    status: capStatusEnum('status').notNull().default('open'),

    /** `[{ documentId?, note?, at }]` — appended as it is produced, never replaced. */
    closureEvidence: jsonb('closure_evidence').$type<unknown[]>().notNull().default([]),
    /**
     * `[{ name, dueOn, doneOn? }]` for multi-year remediation. A structural RSC finding is a
     * schedule a buyer signed off, not a thirty-day fix.
     */
    milestones: jsonb('milestones').$type<unknown[]>(),

    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by').references(() => users.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One corrective action per finding. Two would let one be closed while the other stayed
    // open, and every report would then depend on which one it happened to read.
    uniqueIndex('caps_finding_key').on(t.findingId),
    index('caps_company_status_idx').on(t.companyId, t.status, t.deadline),
    index('caps_company_owner_idx').on(t.companyId, t.ownerUserId, t.status),
    check('caps_closed_has_time', sql`${t.status} <> 'closed' OR ${t.closedAt} IS NOT NULL`),
    // Enforced in the database as well as the service. A closed CAP with nothing behind it
    // asserts to the next auditor that something was done.
    check(
      'caps_closed_has_evidence',
      sql`${t.status} <> 'closed' OR jsonb_array_length(${t.closureEvidence}) > 0`,
    ),
  ],
).enableRLS()

export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** fire, factory, bond, boiler, environment, buyer_cert… — the factory's own vocabulary. */
    kind: text('kind').notNull(),
    number: text('number').notNull(),
    issuedOn: date('issued_on'),
    /** Null means perpetual — a trade licence with no renewal. Never means "unknown". */
    expiresOn: date('expires_on'),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('certificates_company_kind_number_key').on(t.companyId, t.kind, t.number),
    // The expiry ladder scans this, and it is the query the alert job runs nightly.
    index('certificates_company_expiry_idx').on(t.companyId, t.expiresOn),
    check(
      'certificates_expiry_after_issue',
      sql`${t.expiresOn} IS NULL OR ${t.issuedOn} IS NULL OR ${t.expiresOn} >= ${t.issuedOn}`,
    ),
  ],
).enableRLS()

export const trainings = pgTable(
  'trainings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    kind: text('kind').notNull(),
    heldOn: date('held_on').notNull(),
    attendeesCount: integer('attendees_count').notNull(),
    /** The signed attendance sheet — what an auditor asks to see. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('trainings_company_kind_idx').on(t.companyId, t.kind, t.heldOn.desc()),
    check('trainings_attendees_positive', sql`${t.attendeesCount} > 0`),
  ],
).enableRLS()
