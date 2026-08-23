-- Wall 2 for order_inputs (the In-House Check List).
--
-- Same shape as every tenant table: FORCE so even the table owner goes through the
-- policy, one tenant_isolation policy for the app role keyed on the session GUC.
-- Wall 1 is the scoped() predicate in every query; this is the wall that holds when
-- somebody writes the query wall 1 was supposed to be in.
ALTER TABLE "order_inputs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_inputs_tenant_isolation" ON "order_inputs" FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
