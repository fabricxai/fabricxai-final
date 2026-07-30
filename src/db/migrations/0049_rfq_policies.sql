-- Policies for the 1.2 RFQ tables (0048).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rfqs', 'rfq_clarifications', 'quotes', 'loss_reasons']
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
