/**
 * `buyers` — owned by module 1.1 (Buyer Lead Desk), which is not built yet.
 *
 * Only the columns 1.3 and 2.1 genuinely need are here: an order has a buyer and an LC
 * has a buyer, and both need a real foreign key rather than a loose uuid. 1.1 will extend
 * this table (contacts, lead pipeline, terms, scorecards) — additively, since everything
 * below is either required-at-creation or defaulted.
 *
 * Logged in docs/STUBS.md so it is replaced deliberately rather than discovered.
 */
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies, users } from '@/db/schema/core'

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

    isActive: boolean('is_active').notNull().default(true),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('buyers_company_code_key').on(t.companyId, t.code),
    index('buyers_company_name_idx').on(t.companyId, t.name),
  ],
).enableRLS()
