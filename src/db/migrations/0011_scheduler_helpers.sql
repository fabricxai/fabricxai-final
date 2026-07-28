-- ============================================================================
-- Scheduler support.
--
-- A nightly derivation runs for every company, so the scheduler has to know which
-- companies exist — a cross-tenant question, like the outbox relay in 0006 and the
-- session bootstrap in 0004. That makes three, and this is the last of them:
-- everything else in the system is scoped.
--
-- Kept to the same shape as the other two. It returns ids and nothing else, so it
-- cannot be used to read a company's data — only to know that it is there. The
-- per-company work then runs inside a normal scoped transaction, bound by RLS
-- exactly like a request.
-- ============================================================================
CREATE OR REPLACE FUNCTION app.active_company_ids()
  RETURNS TABLE (company_id uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT c.id
    FROM public.companies c
    WHERE c.is_active
      AND c.deleted_at IS NULL
    ORDER BY c.created_at
  $$;

COMMENT ON FUNCTION app.active_company_ids() IS
  'Scheduler only: ids of live companies, so nightly jobs can fan out. Returns no company data.';

REVOKE ALL ON FUNCTION app.active_company_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.active_company_ids() TO fabricxai_app;
