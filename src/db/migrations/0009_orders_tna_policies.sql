-- RLS policies for the ten tables added by 0008.
--
-- `.enableRLS()` in the Drizzle schema emits ENABLE ROW LEVEL SECURITY and nothing else;
-- a policy is not something Drizzle can express. A table left in that state is deny-all
-- for the application role — which is fail-closed and therefore safe, but also broken.
-- This is the second time (see 0007); every new tenant table needs its policy alongside.
--
-- Table privileges come from the ALTER DEFAULT PRIVILEGES set in 0002, so only policies
-- are needed here.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buyers',
    'lcs',
    'btb_lcs',
    'orders',
    'order_styles',
    'order_breakdowns',
    'order_revisions',
    'order_lcs',
    'order_files',
    'tna_templates',
    'tna_milestones'
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
