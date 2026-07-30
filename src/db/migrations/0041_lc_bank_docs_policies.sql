-- Policies for the 2.1 bank-docs tables (0040).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lc_amendments', 'doc_submissions', 'bank_charges']
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
