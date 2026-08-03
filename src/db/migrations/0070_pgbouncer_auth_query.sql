-- ============================================================================
-- Getting the application's password off the pooler's disk.
--
-- Dev runs PgBouncer with `auth_type = plain` and a `userlist.txt` holding the app
-- role's password in cleartext. `docs/STUBS.md` has said since 2026-07-29 that
-- production must not, and the deployment audit (INFRA-B4) called it a blocker:
-- a file with every role's password in it, mounted into a container, is one
-- `docker cp` from being the whole database.
--
-- The fix is the standard one, and it needs a function because PgBouncer cannot
-- read `pg_shadow` as an unprivileged role.
--
--   auth_type  = scram-sha-256   → PgBouncer performs a SCRAM exchange with the
--                                  client. It never needs, and never sees, a
--                                  plaintext password.
--   auth_user  = pgbouncer_auth  → the role PgBouncer connects as to look one up.
--   auth_query = this function   → returns ONE role's SCRAM verifier.
--
-- What PgBouncer gets back is a verifier, not a secret it can replay elsewhere,
-- and the only credential left on disk is `pgbouncer_auth`'s own — a role that
-- can do precisely nothing but call this function.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The lookup role.
--
-- NOINHERIT and no grants at all beyond the EXECUTE below: if this credential
-- leaks, what it buys is the ability to read password VERIFIERS for roles the
-- attacker must already be able to name — not to read a single row of factory
-- data. Its password is set by `scripts/setup-db-roles.mjs` from the environment,
-- never here: a password in a migration file is a password in git.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgbouncer_auth') THEN
    CREATE ROLE pgbouncer_auth LOGIN NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE pgbouncer_auth LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- The lookup itself.
--
-- Two deliberate refusals, both of which matter more than they look:
--
--  1. It will not return a SUPERUSER's verifier. Nothing should ever reach this
--     database through the pooler as a superuser — the app role is the only
--     client PgBouncer serves, and the owner connects directly
--     (DIRECT_DATABASE_URL) precisely so it never passes through here. Refusing
--     superusers means a misconfigured client cannot use the pooler to
--     authenticate as one.
--  2. It will not return its own. A lookup role that can look itself up is a
--     small loop with no purpose and one more thing to reason about.
--
-- `rolcanlogin` is checked so a group role — `fabricxai_app`, which is NOLOGIN
-- and carries the privileges — cannot be authenticated as.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.pgbouncer_get_auth(p_username text)
  RETURNS TABLE (username text, password text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  -- Same reason as every other definer function in this schema: resolving names
  -- through the caller's search_path is a privilege-escalation hole.
  SET search_path = pg_catalog, public
  AS $$
    SELECT s.usename::text, s.passwd::text
    FROM pg_catalog.pg_shadow s
    JOIN pg_catalog.pg_roles r ON r.rolname = s.usename
    WHERE s.usename = p_username
      AND r.rolcanlogin
      AND NOT r.rolsuper
      AND s.usename <> 'pgbouncer_auth'
  $$;--> statement-breakpoint

COMMENT ON FUNCTION app.pgbouncer_get_auth(text) IS
  'PgBouncer auth_query. Returns one non-superuser login role''s SCRAM verifier so the pooler needs no password file. Executable only by pgbouncer_auth.';--> statement-breakpoint

REVOKE ALL ON FUNCTION app.pgbouncer_get_auth(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.pgbouncer_get_auth(text) TO pgbouncer_auth;--> statement-breakpoint

-- Explicitly NOT granted to fabricxai_app. The application has no business
-- reading verifiers, and the grant above is the only one this function gets.
REVOKE ALL ON FUNCTION app.pgbouncer_get_auth(text) FROM fabricxai_app;
