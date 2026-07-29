-- ============================================================================
-- Monthly partitions for hourly_outputs ⚡
--
-- Partitioning was declared in 0018 (PARTITION BY RANGE (produced_on), edited into the
-- generated DDL before it was ever applied). This file supplies the partitions themselves
-- and the machinery to keep making them.
--
-- Why from day one: this is the highest-volume table in the system — 50 lines × ~10
-- entries a day × 2 years is past a million rows for ONE factory — and retrofitting
-- partitioning onto a live table means an exclusive lock and a maintenance window nobody
-- will ever schedule. Architecture §8.3 names hourly_outputs growth as the third thing
-- that breaks; this is the pre-planned answer, paid for in advance.
--
-- A DEFAULT partition catches anything outside the declared range. Without it an insert
-- for an unexpected month fails outright, which on a floor tablet means a supervisor's
-- hourly count is simply refused. Rows landing in DEFAULT are a monitoring signal, not a
-- correctness problem — the maintenance job below moves the window forward.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.ensure_hourly_output_partition(p_month date)
  RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('hourly_outputs_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
  IF to_regclass(format('public.%I', v_name)) IS NOT NULL THEN
    RETURN v_name;
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.hourly_outputs FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end);

  -- Each partition inherits RLS enablement from the parent, but FORCE and the policy are
  -- per-table and must be applied here. A partition without them is a hole in wall 2 that
  -- appears silently, next month, when nobody is looking.
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_name);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO fabricxai_app
       USING (company_id = app.current_company_id())
       WITH CHECK (company_id = app.current_company_id())',
    v_name || '_tenant_isolation', v_name);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO fabricxai_app', v_name);

  RETURN v_name;
END
$$;

COMMENT ON FUNCTION app.ensure_hourly_output_partition(date) IS
  'Creates the monthly partition for a date if absent, with RLS forced and the tenant policy applied. Idempotent.';

REVOKE ALL ON FUNCTION app.ensure_hourly_output_partition(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ensure_hourly_output_partition(date) TO fabricxai_app;

-- The catch-all. Anything outside the created months lands here rather than being
-- refused — a rejected insert on the floor is a lost hour of production data.
CREATE TABLE IF NOT EXISTS hourly_outputs_default PARTITION OF hourly_outputs DEFAULT;
ALTER TABLE hourly_outputs_default FORCE ROW LEVEL SECURITY;
CREATE POLICY hourly_outputs_default_tenant_isolation ON hourly_outputs_default
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON hourly_outputs_default TO fabricxai_app;

-- Seed a window around now: the previous month (late corrections still arrive), the
-- current one, and twelve ahead so a scheduler outage cannot strand the floor.
DO $$
DECLARE
  i int;
BEGIN
  FOR i IN -1..12 LOOP
    PERFORM app.ensure_hourly_output_partition((date_trunc('month', now()) + (i || ' month')::interval)::date);
  END LOOP;
END
$$;

-- The parent's own policy, for completeness — reads route through it.
ALTER TABLE hourly_outputs FORCE ROW LEVEL SECURITY;
CREATE POLICY hourly_outputs_tenant_isolation ON hourly_outputs
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
