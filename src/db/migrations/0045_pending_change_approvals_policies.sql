-- Policy for the multi-approver table (0044). Table privileges come from the ALTER DEFAULT
-- PRIVILEGES set in 0002, so only the policy is needed.
--
-- No DELETE in practice: the table is append-only by convention and by the service, because
-- "who signed off on this and when" must survive somebody changing their mind.
ALTER TABLE "pending_change_approvals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pending_change_approvals_tenant_isolation" ON "pending_change_approvals"
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
