-- Wall 2 for the three dossier-addition tables — same shape as every tenant table.
ALTER TABLE "order_fabric_legs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_fabric_legs_tenant_isolation" ON "order_fabric_legs" FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());--> statement-breakpoint
ALTER TABLE "order_drops" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_drops_tenant_isolation" ON "order_drops" FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());--> statement-breakpoint
ALTER TABLE "order_colour_approvals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_colour_approvals_tenant_isolation" ON "order_colour_approvals" FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
