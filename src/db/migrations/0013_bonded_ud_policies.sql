-- Policies for the UD tables (0012). `.enableRLS()` emits ENABLE only; the policy is the
-- other half, and without it the table is deny-all for the application role.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['uds', 'ud_consumptions', 'ud_reconciliations']
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
