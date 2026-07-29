-- `suppliers` now exists (module 3.2), so the FK deferred when 2.1 was built can land.
-- Owned by commercial (rule 11: btb_lcs has one writer module), which is why this is its
-- own migration rather than part of the procurement slice.
ALTER TABLE "btb_lcs"
  ADD CONSTRAINT "btb_lcs_supplier_id_suppliers_id_fk"
  FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id")
  ON DELETE restrict ON UPDATE no action;
