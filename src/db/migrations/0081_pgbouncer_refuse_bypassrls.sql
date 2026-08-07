-- ============================================================================
-- The pooler's lookup refuses BYPASSRLS roles, not just superusers.
--
-- `app.pgbouncer_get_auth` filtered on `NOT r.rolsuper`. That is the right idea applied to
-- the wrong column. What makes a role dangerous to hand to the pooler is not being a
-- superuser — it is being able to READ EVERY TENANT'S ROWS, and `BYPASSRLS` does exactly
-- that without `rolsuper` being set.
--
-- On the default deployment the owner is a superuser, so it was excluded by accident and
-- the hole never opened. On the HARDENED deployment — a non-superuser owner, which is what
-- `docs/DEPLOYMENT-READINESS-AUDIT.md` recommends and what the `owner-privileges` CI job
-- exists to prove — the owner is `NOSUPERUSER BYPASSRLS`, and every one of those words is
-- required: every policy targets `fabricxai_app`, tenant tables are FORCE RLS, and the
-- SECURITY DEFINER helpers return nothing without it.
--
-- So on precisely the configuration this project tells operators to adopt, the function
-- returned the owner's SCRAM verifier to PgBouncer. Anything able to reach the pooler could
-- then authenticate as a role that reads across every company in the database. Wall 2 was
-- not merely bypassed; it was being handed out on request.
--
-- `scripts/setup-db-roles.mjs` has asserted against this since it was written. It never
-- fired because the CI job that provisions a hardened owner left PGBOUNCER_AUTH_PASSWORD
-- unset, so the entire block printed "skipping" — the assertion was correct and unreachable.
-- Setting that variable is what surfaced this.
--
-- CREATE OR REPLACE, so this is a definition change with no downtime and no dependency
-- churn: the grants from 0070 and the schema USAGE from 0080 still apply.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.pgbouncer_get_auth(p_username text)
  RETURNS TABLE (username text, password text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT s.usename::text, s.passwd::text
    FROM pg_catalog.pg_shadow s
    JOIN pg_catalog.pg_roles r ON r.rolname = s.usename
    WHERE s.usename = p_username
      AND r.rolcanlogin
      AND NOT r.rolsuper
      -- The line this migration exists for. A NOSUPERUSER role holding BYPASSRLS reads
      -- every tenant's rows, which is the thing the pooler must never be able to become.
      AND NOT r.rolbypassrls
      AND s.usename <> 'pgbouncer_auth'
  $$;

COMMENT ON FUNCTION app.pgbouncer_get_auth(text) IS
  'PgBouncer auth_query. Returns one login role''s SCRAM verifier — never a superuser, never a BYPASSRLS role, never itself. Executable only by pgbouncer_auth.';
