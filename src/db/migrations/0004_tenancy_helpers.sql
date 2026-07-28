-- ============================================================================
-- Making wall 2 load-bearing.
--
-- Migration 0002 wrote the policies; this one supplies what the application
-- needs to run as a non-owner role without either weakening a policy or holding
-- an owner connection in the app process.
--
-- Deliberately tiny. Every line that can see across tenants is in this file, and
-- there is only one of them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The session bootstrap problem.
--
-- Login is a chicken-and-egg: to scope a transaction we need the company id, and
-- to learn the company id we must read `roles` — which is exactly what RLS
-- forbids until a scope exists. Every workaround that keeps the query in the app
-- (a policy on user_id, an app.user_id GUC) just moves the same unscoped read
-- somewhere less visible.
--
-- So: one SECURITY DEFINER function, one query, returning nothing but the
-- caller's own memberships. It cannot be asked about anyone else — the user id
-- is its only parameter and it returns no other columns.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.memberships_for_user(p_user_id text)
  RETURNS TABLE (company_id uuid, role role_name)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  -- Pin the search_path: a SECURITY DEFINER function that resolves names through
  -- the caller's search_path is a privilege-escalation hole.
  SET search_path = pg_catalog, public
  AS $$
    SELECT r.company_id, r.role
    FROM public.roles r
    WHERE r.user_id = p_user_id
      AND r.revoked_at IS NULL
    ORDER BY r.created_at
  $$;

COMMENT ON FUNCTION app.memberships_for_user(text) IS
  'Session bootstrap only: the caller''s own memberships, before any tenant scope exists. The only cross-tenant read in the system.';

REVOKE ALL ON FUNCTION app.memberships_for_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.memberships_for_user(text) TO fabricxai_app;

-- ----------------------------------------------------------------------------
-- Signup needs no special privilege at all.
--
-- Creating a company looks like it must bypass RLS — the row cannot satisfy
-- `id = app.current_company_id()` before it exists. It does not: the application
-- generates the uuid first, sets the scope to it, and only then inserts. The
-- policies from 0002 then pass unmodified, and the company plus its owner row
-- and profile are written inside one already-scoped transaction.
--
-- Recorded here because the next person reading 0002 will wonder why signup
-- works, and the answer is in application code (src/lib/auth.ts), not in a
-- policy exception.
-- ----------------------------------------------------------------------------

-- Fail loudly if the role 0002 created has gone missing, rather than leaving a
-- database that looks fine and enforces nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabricxai_app') THEN
    RAISE EXCEPTION 'fabricxai_app role is missing — migration 0002 did not run';
  END IF;
END
$$;
