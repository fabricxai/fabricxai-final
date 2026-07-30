-- Policies for the 7.1 quality tables (0033).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'defect_codes', 'inline_checks', 'dhu_daily', 'fabric_inspections',
    'measurement_specs', 'measurement_checks',
    'final_inspections', 'final_inspection_photos', 'third_party_inspections'
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

-- `aql_tables` is deliberately NOT in that list. It holds ANSI/ASQ Z1.4 — a published
-- standard, identical for every tenant, with no company_id to scope on. RLS with a
-- company predicate is impossible here, and a per-tenant copy would be a per-tenant
-- chance to edit an acceptance number that decides whether shipments ship.
--
-- So it is world-readable and app-immutable: SELECT to the app role, no INSERT/UPDATE/
-- DELETE. Seeding and revising the standard go through the migration/owner role, which is
-- the only place a change to a published standard belongs.
REVOKE ALL ON "aql_tables" FROM fabricxai_app;--> statement-breakpoint
GRANT SELECT ON "aql_tables" TO fabricxai_app;
