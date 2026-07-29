-- Policies for the 3.2 procurement tables (0028).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'suppliers', 'purchase_requisitions', 'purchase_requisition_lines',
    'supplier_quotes', 'supplier_quote_lines',
    'supplier_pos', 'supplier_po_lines', 'supplier_scores'
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
