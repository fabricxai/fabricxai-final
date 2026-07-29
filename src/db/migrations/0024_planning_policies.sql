-- Policies for the 4.1 planning tables (0023).
-- `lines` is not in this list: it was created under 6.1 and already has its policy from
-- 0020. Only its OWNERSHIP moved to this module (rule 11), not its SQL.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'factory_units', 'floors', 'line_calendars',
    'smv_records', 'learning_curves', 'allocations', 'scenarios'
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
