-- Policies for the costing tables (0021).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['boms', 'bom_lines', 'cost_sheets', 'consumption_templates']
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
