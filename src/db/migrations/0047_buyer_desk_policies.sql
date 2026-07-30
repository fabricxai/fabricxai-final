-- Policies for the 1.1 buyer-desk tables (0046). `buyers` already has one from 0009.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agents', 'leads', 'lead_activities', 'buyer_contacts',
    'buyer_terms', 'buyer_requirements', 'buyer_documents'
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

-- Trigram indexes for duplicate detection. `pg_trgm` was installed in 0001.
--
-- On the NORMALISED column, not the raw name: "Ltd" is on every Bangladeshi company name,
-- so a trigram index over the raw text makes every supplier look similar to every other and
-- the real duplicate is lost in the noise.
CREATE INDEX "buyers_normalized_name_trgm"
  ON "buyers" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "leads_normalized_name_trgm"
  ON "leads" USING gin ("normalized_name" gin_trgm_ops);
