/**
 * The identity tables, under a tenant scope (audit N2, migration 0073).
 *
 * `users`, `profiles`, `sessions`, `accounts` and `verifications` carried no row level
 * security at all while the app role held DML on every one of them. From inside any
 * tenant-scoped transaction — where every service, job and action in this codebase runs —
 * the app role could read another factory's user emails, their live session tokens and
 * their password hashes, and UPDATE users.
 *
 * Asserted through a real app-role connection rather than through a service, for the same
 * reason the seed's isolation sweep is: a service test proves the query nobody wrote is
 * still unwritten. This proves the database refuses it.
 *
 * The other half matters just as much and is the reason a plain deny-all was not available:
 * Better Auth queries these tables with NO scope set, so a policy that denied the unscoped
 * path would break every login in the system. Both directions are asserted here.
 */
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { accounts, sessions, verifications } from '@/db/schema/auth'
import { companies, profiles, roles, users } from '@/db/schema/core'

const RUN = Math.random().toString(36).slice(2, 10)

const owner = createDirectClient()
const db = createDirectDb(owner)
/** The runtime role, exactly as the app connects — RLS binds this one. */
const app = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} })

const A = { companyId: crypto.randomUUID(), userId: `n2-a-${RUN}`, email: `a-${RUN}@n2.test` }
const B = { companyId: crypto.randomUUID(), userId: `n2-b-${RUN}`, email: `b-${RUN}@n2.test` }

/** Everything one factory owns: a company, a member, their profile, credential and session. */
async function makeFactory(f: typeof A, name: string) {
  await db.insert(companies).values({ id: f.companyId, name, slug: `${name}-${RUN}`.toLowerCase() })
  await db.insert(users).values({ id: f.userId, email: f.email, name, emailVerified: true })
  await db.insert(profiles).values({ userId: f.userId, fullName: name })
  await db.insert(roles).values({ companyId: f.companyId, userId: f.userId, role: 'owner' })
  await db.insert(accounts).values({
    id: `acct-${f.userId}`,
    userId: f.userId,
    accountId: f.userId,
    providerId: 'credential',
    password: `hash-must-never-leak-${f.userId}`,
  })
  await db.insert(sessions).values({
    id: `sess-${f.userId}`,
    userId: f.userId,
    token: `token-must-never-leak-${f.userId}`,
    activeOrganizationId: f.companyId,
    expiresAt: new Date(Date.now() + 3_600_000),
  })
  await db.insert(verifications).values({
    id: `ver-${f.userId}`,
    identifier: f.email,
    value: `reset-token-${f.userId}`,
    expiresAt: new Date(Date.now() + 3_600_000),
  })
}

/** Run a query with a company scope set, the way every service reaches the database. */
async function scopedTo<T>(companyId: string, query: (tx: postgres.TransactionSql) => Promise<T>) {
  return app.begin(async (tx) => {
    await tx`select set_config('app.company_id', ${companyId}, true)`
    return query(tx)
  }) as Promise<T>
}

beforeAll(async () => {
  await makeFactory(A, `n2a${RUN}`)
  await makeFactory(B, `n2b${RUN}`)
})

afterAll(async () => {
  // Companies cascade to roles; the identity rows are install-wide and go explicitly.
  for (const f of [A, B]) {
    await db.delete(companies).where(eq(companies.id, f.companyId))
    await db.delete(sessions).where(eq(sessions.userId, f.userId))
    await db.delete(accounts).where(eq(accounts.userId, f.userId))
    await db.delete(verifications).where(eq(verifications.identifier, f.email))
    await db.delete(profiles).where(eq(profiles.userId, f.userId))
    await db.delete(users).where(eq(users.id, f.userId))
  }
  await app.end()
  await owner.end()
})

describe('a scoped transaction cannot read another factory', () => {
  it('sees its own members and not the other factory’s', async () => {
    const rows = await scopedTo(A.companyId, (tx) => tx`select id, email from users`)
    const ids = rows.map((r) => r.id)

    expect(ids).toContain(A.userId)
    // The exploit: one query, from inside an ordinary tenant transaction, returning
    // another factory's staff list.
    expect(ids).not.toContain(B.userId)
  })

  it('cannot reach the other factory’s profile', async () => {
    const rows = await scopedTo(A.companyId, (tx) => tx`select user_id from profiles`)

    expect(rows.map((r) => r.user_id)).not.toContain(B.userId)
  })

  it('cannot read a password hash — not even its own factory’s', async () => {
    // No service has any business with a credential row, so the policy denies all of them
    // under a scope rather than trusting that no such service ever appears.
    const rows = await scopedTo(A.companyId, (tx) => tx`select id, password from accounts`)

    expect(rows).toHaveLength(0)
  })

  it('cannot read a session token', async () => {
    // A live token is a login. This is the row that turns a read into an impersonation.
    const rows = await scopedTo(A.companyId, (tx) => tx`select id, token from sessions`)

    expect(rows).toHaveLength(0)
  })

  it('cannot read an email verification or password-reset token', async () => {
    const rows = await scopedTo(A.companyId, (tx) => tx`select id, value from verifications`)

    expect(rows).toHaveLength(0)
  })

  it('cannot rewrite another factory’s user record', async () => {
    // UPDATE was granted too, so reading was never the whole exposure: an email swap is an
    // account takeover once a reset link follows it.
    const updated = await scopedTo(
      A.companyId,
      (tx) => tx`update users set email = 'stolen@n2.test' where id = ${B.userId} returning id`,
    )
    expect(updated).toHaveLength(0)

    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, B.userId))
    expect(row?.email).toBe(B.email)
  })
})

describe('the unscoped path still works, or nobody can log in', () => {
  it('finds a user by email with no company scope, which is what login does', async () => {
    // Better Auth queries on the pooled handle outside withTenantTx. If this returns zero
    // rows, every login in the system fails — the reason these are scope-conditional
    // policies rather than the deny-all that `invitations` got in 0069.
    const rows = await app`select id from users where email = ${B.email}`

    expect(rows.map((r) => r.id)).toContain(B.userId)
  })

  it('reads the credential and session rows login depends on', async () => {
    const credential = await app`select id from accounts where user_id = ${B.userId}`
    const session = await app`select id from sessions where user_id = ${B.userId}`
    const verification = await app`select id from verifications where identifier = ${B.email}`

    expect(credential).toHaveLength(1)
    expect(session).toHaveLength(1)
    expect(verification).toHaveLength(1)
  })
})
