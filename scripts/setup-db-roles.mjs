#!/usr/bin/env node
/**
 * Create the application's LOGIN role and grant it the `fabricxai_app` privilege
 * bundle — `pnpm db:setup-roles`. Run once after `pnpm db:migrate`.
 *
 * Why this is a script and not a migration: the role needs a password, and a password in
 * a migration file is a password in git. Here it comes from DATABASE_URL, which is
 * already the one place the app's credentials live. The script is idempotent, so running
 * it again after a password rotation is the rotation procedure.
 *
 * `fabricxai_app` itself (NOLOGIN, NOBYPASSRLS, owns nothing) is created by migration
 * 0002. This only adds an account that inherits it.
 */
import 'dotenv/config'

import postgres from 'postgres'

const appUrl = process.env.DATABASE_URL
const ownerUrl = process.env.DIRECT_DATABASE_URL

if (!appUrl || !ownerUrl) {
  console.error('DATABASE_URL and DIRECT_DATABASE_URL must both be set')
  process.exit(1)
}

const parsed = new URL(appUrl)
const username = decodeURIComponent(parsed.username)
const password = decodeURIComponent(parsed.password)

if (!username || !password) {
  console.error('DATABASE_URL must carry the application role name and password')
  process.exit(1)
}

if (username === new URL(ownerUrl).username) {
  console.error(
    `refusing to continue: DATABASE_URL uses "${username}", which is the migration/owner role.\n` +
      'The whole point of this role is that it is NOT the owner — RLS does not apply to a table owner.',
  )
  process.exit(1)
}

const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} })

try {
  const [existing] = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${username}`

  // Identifiers cannot be bound as parameters; the value comes from our own env and is
  // validated above, but quote it defensively all the same.
  if (existing) {
    await sql.unsafe(`ALTER ROLE ${quoteIdent(username)} WITH LOGIN NOBYPASSRLS`)
    console.log(`[roles] ${username} already exists`)
  } else {
    await sql.unsafe(`CREATE ROLE ${quoteIdent(username)} LOGIN NOBYPASSRLS`)
    console.log(`[roles] created ${username}`)
  }

  await sql.unsafe(`ALTER ROLE ${quoteIdent(username)} WITH PASSWORD ${quoteLiteral(password)}`)
  await sql.unsafe(`GRANT fabricxai_app TO ${quoteIdent(username)}`)
  console.log(`[roles] granted fabricxai_app to ${username}`)

  // Prove the thing we actually care about: this role must NOT be able to see
  // across tenants, and must NOT own the tables.
  const [check] = await sql`
    SELECT r.rolbypassrls AS bypasses_rls, r.rolsuper AS is_superuser
    FROM pg_roles r WHERE r.rolname = ${username}`

  if (check?.bypasses_rls || check?.is_superuser) {
    throw new Error(
      `${username} has BYPASSRLS or SUPERUSER — row level security would not apply to it`,
    )
  }
  console.log(`[roles] verified: ${username} is not superuser and does not bypass RLS`)

  // The OWNER side of the same contract, stated instead of assumed. Every policy in the
  // schema is `TO fabricxai_app` and every tenant table is FORCE RLS, so the owner is
  // bound by RLS too unless it holds BYPASSRLS (or is a superuser, as the dev initdb
  // user happens to be). Eight SECURITY DEFINER functions — login's membership lookup,
  // the outbox relay's batch claim, the scheduler's health reads — execute as the owner
  // and read forced tables: with a hardened, non-BYPASSRLS owner they all return zero
  // rows, which presents as "login broken, events undelivered", not as an RLS error.
  // Decision (audit DB-B1): the owner role MUST hold BYPASSRLS. Enforced here, at
  // provisioning, where the operator who hardened the role is still looking.
  const ownerName = new URL(ownerUrl).username
  const [owner] = await sql`
    SELECT r.rolbypassrls AS bypasses_rls, r.rolsuper AS is_superuser
    FROM pg_roles r WHERE r.rolname = ${ownerName}`

  if (!owner?.bypasses_rls && !owner?.is_superuser) {
    throw new Error(
      `${ownerName} (the migration/owner role) has neither BYPASSRLS nor SUPERUSER.\n` +
        'FORCE ROW LEVEL SECURITY binds the owner too, and the SECURITY DEFINER helpers\n' +
        '(membership lookup at login, outbox batch claim, scheduler health) would all\n' +
        `return zero rows. Fix: ALTER ROLE ${quoteIdent(ownerName)} BYPASSRLS;`,
    )
  }
  console.log(`[roles] verified: ${ownerName} can bypass RLS (owner/migration duties)`)

  // BYPASSRLS is necessary and NOT sufficient for a hardened owner. Two of the owner's
  // duties need privileges it does not imply, and both fail in ways that do not mention
  // the owner at all (audit DB-B1, found by the `owner-privileges` CI job):
  //
  //   · `app.pgbouncer_get_auth` is SECURITY DEFINER, so it reads verifiers with the
  //     OWNER's rights. `pg_shadow` is superuser-only, so a non-superuser owner needs an
  //     explicit grant or the pooler's auth_query fails and every client is refused.
  //   · `vector` is not a trusted extension: migration 0000 cannot create it as a
  //     non-superuser, and only passes because `IF NOT EXISTS` makes it a no-op once a
  //     superuser has.
  //
  // Reported rather than fixed here: granting on a system catalogue is a superuser act,
  // so this script cannot do it — it can only tell the operator, now, instead of leaving
  // it to be discovered by a pooler that refuses everybody.
  if (!owner.is_superuser) {
    const [readsShadow] = await sql`
      SELECT has_table_privilege(${ownerName}, 'pg_shadow', 'SELECT') AS ok`
    if (!readsShadow?.ok) {
      console.warn(
        `[roles] WARNING: ${ownerName} cannot read pg_shadow.\n` +
          '        app.pgbouncer_get_auth() runs as this role, so PgBouncer auth_query\n' +
          `        will fail and refuse every client. Fix, as a superuser:\n` +
          `          GRANT SELECT ON pg_shadow TO ${quoteIdent(ownerName)};`,
      )
    } else {
      console.log(`[roles] verified: ${ownerName} can read pg_shadow (pooler auth_query)`)
    }
  }

  // ── The pooler's lookup account ───────────────────────────────────────────────
  //
  // Migration 0070 creates `pgbouncer_auth` and grants it EXECUTE on one function;
  // like every other role here, its PASSWORD comes from the environment rather than
  // from a migration, because a password in a migration file is a password in git.
  //
  // Optional on purpose. Dev runs the pooler with a cleartext userlist and does not
  // need this account, so an unset variable is a skip with a reason rather than a
  // failure — but production must set it, and `pgbouncer.prod.ini` will not start
  // without the credential.
  const poolerPassword = process.env.PGBOUNCER_AUTH_PASSWORD
  if (poolerPassword) {
    await sql.unsafe(`ALTER ROLE "pgbouncer_auth" WITH PASSWORD ${quoteLiteral(poolerPassword)}`)

    // Prove the lookup actually answers for the app role before a pooler depends on
    // it. A silent empty result here is every client failing to authenticate later,
    // which looks like a password problem and is not one.
    const [probe] = await sql`SELECT username FROM app.pgbouncer_get_auth(${username})`
    if (probe?.username !== username) {
      throw new Error(
        `app.pgbouncer_get_auth('${username}') returned nothing — PgBouncer would refuse\n` +
          'every client. Check that the role can log in and is not a superuser.',
      )
    }

    // And prove it refuses what it must refuse. The function exists to hand out one
    // non-superuser verifier; if it ever answers for the owner, the pooler becomes a
    // way to authenticate as a role that bypasses RLS.
    const ownerProbe = await sql`SELECT username FROM app.pgbouncer_get_auth(${ownerName})`
    if (ownerProbe.length > 0) {
      throw new Error(
        `app.pgbouncer_get_auth('${ownerName}') returned a verifier for the owner role — ` +
          'the pooler must never be able to authenticate a role that bypasses RLS',
      )
    }

    console.log('[roles] pgbouncer_auth password set · auth_query verified (app yes, owner no)')
  } else {
    console.log('[roles] PGBOUNCER_AUTH_PASSWORD unset — skipping (dev uses a cleartext userlist)')
  }
} finally {
  await sql.end()
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`
}
