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
} finally {
  await sql.end()
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`
}
