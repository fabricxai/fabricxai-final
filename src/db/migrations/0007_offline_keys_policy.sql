-- `offline_keys` was created with RLS enabled (Drizzle emits that from .enableRLS())
-- but a policy is not something Drizzle can express, so 0005 left the table deny-all.
-- Forward-fix, never an edit to an applied migration (PLAYBOOK §5).
--
-- Reminder for every future tenant table: `.enableRLS()` in the schema is half the job.
-- The policy is the other half and it lives in a custom migration next to it.

ALTER TABLE offline_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY offline_keys_tenant_isolation ON offline_keys
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
