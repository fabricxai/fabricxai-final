-- Policies for the X.3 settings tables (0051).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['policy_settings', 'company_profiles', 'module_toggles']
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
