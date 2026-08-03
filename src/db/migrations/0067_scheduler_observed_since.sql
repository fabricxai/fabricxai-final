-- ============================================================================
-- app.scheduler_observed_since() — "how long have we been watching at all?"
--
-- `app.scheduler_last_success()` (0065) tells /api/health when each task last ran. It
-- cannot tell the endpoint anything about a task that has NEVER run, and the endpoint
-- treated that as an outage the moment any OTHER task had run. On a freshly started
-- worker that is every daily task for its first day and every monthly task for its first
-- month — so a healthy deployment reported 503 for up to 31 days.
--
-- The per-company job already solved this: it measures a never-run task from the
-- company's creation rather than treating it as infinitely stale (see `staleTasks`).
-- This is the deployment-level equivalent of that baseline. A task cannot have been
-- provably silent for longer than we have been recording runs at all.
--
-- Same shape as its sibling: one timestamp, no company data, so it cannot be used to
-- read any tenant's rows. NULL when nothing has ever run, which the caller already
-- treats as healthy-but-unproven.
--
-- Pruning (`core.prune_job_runs`) keeps the most recent success per task whatever its
-- age, so this baseline stays anchored to real history rather than jumping forward to
-- the retention window every night.
-- ============================================================================
CREATE OR REPLACE FUNCTION app.scheduler_observed_since()
  RETURNS timestamptz
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT min(r.started_at) FROM public.job_runs r
  $$;
--> statement-breakpoint
COMMENT ON FUNCTION app.scheduler_observed_since() IS
  'Health endpoint only: when this deployment first recorded a job run, across all companies. Returns no company data.';
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.scheduler_observed_since() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.scheduler_observed_since() TO fabricxai_app;
