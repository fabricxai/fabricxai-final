/**
 * Better Auth tables (dev-plan §2, PLAYBOOK §1 session 2).
 *
 * Better Auth owns these four outright — do not add application columns here; put those
 * on `profiles` instead, so a Better Auth upgrade never collides with our data.
 *
 * The organization plugin does NOT get its own tables: `organization` is mapped onto our
 * `companies` and `member` onto our `roles` (see `src/lib/auth.ts`). That mapping is the
 * whole point of the plugin for us — it means the auth layer and the tenancy layer agree
 * on what a company is by construction, rather than by a sync job.
 *
 * Column shapes come from `getAuthTables()` in @better-auth/core, not from guesswork.
 * Ids are text everywhere in this file: Better Auth generates them and we let it, so its
 * id format is never our problem. `companies`/`roles` keep their uuid keys, which is why
 * `advanced.database.generateId` is pinned to randomUUID() in the auth config.
 */
import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies, roleNameEnum, users } from './core'

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /**
     * The company this session is currently acting in — set by the organization plugin,
     * and the single source of `ctx.companyId`. A user who belongs to two factories
     * switches by changing this, not by anything the client sends.
     */
    activeOrganizationId: uuid('active_organization_id').references(() => companies.id, {
      onDelete: 'set null',
    }),

    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_key').on(t.token),
    index('sessions_user_idx').on(t.userId),
    // Expired-session sweep; also keeps lookups off a seq scan.
    index('sessions_expires_idx').on(t.expiresAt),
  ],
)

/**
 * Credentials and OAuth links. For email+password the hash lives in `password` with
 * `provider_id = 'credential'` — never on `users`.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('accounts_user_idx').on(t.userId),
    uniqueIndex('accounts_provider_account_key').on(t.providerId, t.accountId),
  ],
)

/**
 * Short-lived tokens: email verification, password reset. Rows are consumed on use and
 * swept after expiry — nothing here is worth keeping.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('verifications_identifier_idx').on(t.identifier),
    index('verifications_expires_idx').on(t.expiresAt),
  ],
)

/** Pending invitations into a company. Accepting one creates the `roles` row. */
export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: roleNameEnum('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('invitations_organization_idx').on(t.organizationId),
    index('invitations_email_idx').on(sql`lower(${t.email})`),
  ],
)
