-- Policies for the 11.2 Analytics tables (0062).
--
-- `exceptions_feed` is a table rather than a materialized view precisely so it can carry
-- these: Postgres does not apply row-level security to materialized views, and a
-- cross-tenant view of every factory's exceptions is not a trade worth making.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exceptions_feed', 'saved_reports', 'scheduled_exports']
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
