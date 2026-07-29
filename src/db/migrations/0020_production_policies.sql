-- Policies for the remaining 6.1 tables (hourly_outputs is handled in 0019, where its
-- partitions get theirs too).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lines', 'daily_line_plans', 'downtimes', 'endline_counts',
    'efficiency_daily', 'wip_snapshots'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO fabricxai_app
         USING (company_id = app.current_company_id())
         WITH CHECK (company_id = app.current_company_id())',
      t || '_tenant_isolation', t);
  END LOOP;
END
$$;
