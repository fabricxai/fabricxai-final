-- Policies for `job_runs` (0064), plus the one narrow cross-tenant read the health
-- endpoint needs.
ALTER TABLE job_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY job_runs_tenant_isolation ON job_runs FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

-- ============================================================================
-- app.scheduler_last_success() — "is the scheduler alive at all?"
--
-- The in-worker health task can notice one task failing while the others run. It
-- cannot notice the worker being dead, because it is the worker. That check has to
-- live outside, in /api/health, which has no session and therefore no company.
--
-- Kept to the same shape as the other scheduler helpers: it returns a task name and a
-- timestamp and nothing else, so it cannot be used to read any company's data — only
-- to know that something ran. Per-company staleness, with the detail, still runs
-- inside a normal scoped transaction bound by RLS exactly like a request.
-- ============================================================================
CREATE OR REPLACE FUNCTION app.scheduler_last_success()
  RETURNS TABLE (task text, last_success_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT r.task, max(r.finished_at)
    FROM public.job_runs r
    WHERE r.status = 'succeeded'
    GROUP BY r.task
  $$;

COMMENT ON FUNCTION app.scheduler_last_success() IS
  'Health endpoint only: when each scheduled task last succeeded, across all companies. Returns no company data.';

REVOKE ALL ON FUNCTION app.scheduler_last_success() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.scheduler_last_success() TO fabricxai_app;
