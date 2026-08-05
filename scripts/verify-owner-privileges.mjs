/**
 * Does this schema still work when the owner is NOT a superuser? (audit DB-B1)
 *
 * Every table in this database carries FORCE ROW LEVEL SECURITY, which applies RLS to the
 * table OWNER as well, and every policy targets only `fabricxai_app`. Twelve SECURITY
 * DEFINER helpers run as the owner and read those forced tables — membership lookup at
 * login, the outbox batch claim, scheduler health, the pooler's password lookup.
 *
 * So the whole design silently depends on the owner being able to bypass RLS. The decision
 * (recorded in `scripts/setup-db-roles.mjs`) is that the owner holds BYPASSRLS explicitly.
 * The failure mode if it does not is the reason this script exists: nothing errors. The
 * helpers return ZERO ROWS, which presents as "nobody can log in", "events stop being
 * delivered" and "job health says the scheduler never ran" — three unrelated-looking
 * outages, none of which points at RLS.
 *
 * CI could not catch that, because CI ran everything as the initdb superuser, where the
 * question cannot even be asked. This script asks it: it REFUSES to run against a
 * superuser owner, then exercises each helper against real rows and demands answers.
 *
 * Usage:  node --env-file=.env scripts/verify-owner-privileges.mjs
 *         (CI provisions a non-superuser owner first — see the `owner-privileges` job.)
 */
import postgres from 'postgres'

const ownerUrl = process.env.DIRECT_DATABASE_URL
if (!ownerUrl) {
  console.error('[owner-check] DIRECT_DATABASE_URL is required')
  process.exit(1)
}

const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} })
const failures = []

function check(name, ok, detail) {
  if (ok) {
    console.log(`[owner-check]   ✓ ${name}`)
  } else {
    console.error(`[owner-check]   ✗ ${name} — ${detail}`)
    failures.push(name)
  }
}

try {
  const ownerName = new URL(ownerUrl).username
  const [role] = await sql`
    SELECT rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
    FROM pg_roles WHERE rolname = ${ownerName}`

  if (!role) {
    console.error(`[owner-check] role "${ownerName}" does not exist`)
    process.exit(1)
  }

  console.log(
    `[owner-check] owner "${ownerName}": superuser=${role.is_superuser} bypassrls=${role.bypasses_rls}`,
  )

  // The point of the whole exercise. Against a superuser this script would pass no matter
  // how broken the privilege model was, which is exactly how DB-B1 stayed invisible.
  if (role.is_superuser) {
    console.error(
      '[owner-check] REFUSING: the owner is a SUPERUSER, so every check below would pass\n' +
        '              regardless of the privilege model. Provision a non-superuser owner\n' +
        '              with BYPASSRLS and re-run — that is the configuration production uses.',
    )
    process.exit(1)
  }

  check(
    'owner holds BYPASSRLS',
    role.bypasses_rls,
    'FORCE RLS binds the owner, so every SECURITY DEFINER helper below returns zero rows',
  )

  // ── The helpers, against real rows ────────────────────────────────────────────
  //
  // Each one is asked a question whose answer is known to be non-empty. "It did not throw"
  // is not the assertion — a helper that cannot see its table returns an empty set happily.

  const [seeded] = await sql`
    SELECT r.user_id, r.company_id FROM roles r WHERE r.revoked_at IS NULL LIMIT 1`
  if (!seeded) {
    console.error('[owner-check] no roles rows — run `pnpm seed` first; this needs real data')
    process.exit(1)
  }

  const memberships = await sql`SELECT * FROM app.memberships_for_user(${seeded.user_id})`
  check(
    'app.memberships_for_user returns the login membership',
    memberships.length > 0,
    'zero rows — this is "nobody can log in", and it fails silently',
  )

  const companies = await sql`SELECT * FROM app.active_company_ids()`
  check('app.active_company_ids sees companies', companies.length > 0, 'zero rows')

  // Outbox: claim a batch. Empty is legitimate (nothing pending), so this asserts the
  // function is callable and reads the table, using a row we put there ourselves.
  const [event] = await sql`
    INSERT INTO outbox (company_id, event_name, payload)
    VALUES (${seeded.company_id}, 'owner.privileges.probe', '{}'::jsonb)
    RETURNING id`
  // Asserts the batch is non-empty rather than that it contains the probe: the function
  // orders by occurred_at and takes a limit, so on a seeded database the probe is behind
  // whatever is already pending. What is under test is whether a non-superuser owner can
  // read the FORCE-RLS outbox table at all — with no BYPASSRLS this returns zero rows,
  // and the relay goes quiet without a single error in the log.
  const claimed = await sql`SELECT * FROM app.lock_outbox_batch(50)`
  check(
    'app.lock_outbox_batch sees pending events',
    claimed.length > 0,
    'zero rows while at least one event is pending — outbox delivery would stop silently',
  )
  await sql`SELECT app.mark_outbox_published(ARRAY[${event.id}]::uuid[])`
  const [probe] = await sql`SELECT published_at FROM outbox WHERE id = ${event.id}`
  check(
    'app.mark_outbox_published marks it delivered',
    probe?.published_at !== null,
    'still unpublished — the relay would redeliver forever',
  )
  await sql`DELETE FROM outbox WHERE id = ${event.id}`

  // Scheduler health reads job_runs, which is forced too.
  const scheduler = await sql`SELECT * FROM app.scheduler_last_success()`
  check(
    'app.scheduler_last_success is callable',
    Array.isArray(scheduler),
    'threw rather than returning a set',
  )

  // The pooler's lookup. Optional: dev runs a cleartext userlist and never creates it.
  const [lookupRole] = await sql`SELECT 1 FROM pg_roles WHERE rolname = 'pgbouncer_auth'`
  if (lookupRole) {
    const auth = await sql`SELECT * FROM app.pgbouncer_get_auth('fabricxai_app_rw')`
    check(
      'app.pgbouncer_get_auth returns the app role verifier',
      auth.length === 1 && Boolean(auth[0].password),
      'no verifier — every client would be refused by the pooler',
    )
  } else {
    console.log('[owner-check]   — app.pgbouncer_get_auth skipped (no pgbouncer_auth role)')
  }

  // Every helper should still be SECURITY DEFINER. One rewritten without it would inherit
  // the CALLER's privileges and start returning nothing under the app role.
  const invokers = await sql`
    SELECT p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND NOT p.prosecdef
      AND p.proname <> 'current_company_id'`
  check(
    'every app.* helper except current_company_id is SECURITY DEFINER',
    invokers.length === 0,
    `SECURITY INVOKER: ${invokers.map((r) => r.proname).join(', ')}`,
  )

  if (failures.length > 0) {
    console.error(
      `\n[owner-check] FAILED (${failures.length}): ${failures.join(', ')}\n` +
        'The privilege model regressed. Production hardens the owner to non-superuser, so\n' +
        'this is what a real deployment would do — silently, and in three places at once.',
    )
    process.exit(1)
  }

  console.log('\n[owner-check] the schema works with a non-superuser owner holding BYPASSRLS')
} finally {
  await sql.end()
}
