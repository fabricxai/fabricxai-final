-- Wall 2 for order_ship_dates — same shape as every tenant table.
ALTER TABLE "order_ship_dates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_ship_dates_tenant_isolation" ON "order_ship_dates" FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
