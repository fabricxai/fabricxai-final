-- Policies for the 8.1 shipment tables (0037).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finishing_outputs', 'cartons', 'shipments', 'packing_lists', 'shipment_docs'
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
--> statement-breakpoint

-- `cartons.shipment_id` gets its FK here rather than in the Drizzle schema: `cartons` is
-- declared before `shipments` in the same file, and a forward reference between two tables
-- in one module is the one case Drizzle cannot express without a circular initialiser.
ALTER TABLE "cartons"
  ADD CONSTRAINT "cartons_shipment_id_shipments_id_fk"
  FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id")
  ON DELETE SET NULL ON UPDATE no action;
