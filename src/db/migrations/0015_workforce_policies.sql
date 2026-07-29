-- Policies for the workforce tables (0014).
--
-- Payroll is the most sensitive data in the system, but RLS is still only the tenancy
-- wall: it stops company A reading company B. The 🔒 restriction — hr and owner only,
-- bodyless 403 for everyone else, every read audited — is enforced in the service layer,
-- because "which ROLE may read this" is not something a company-scoped policy expresses.
-- See modules/workforce/service.ts.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wage_gazettes', 'wage_grades', 'workers', 'attendance', 'leaves',
    'payroll_runs', 'payroll_lines', 'festival_bonus_runs', 'skill_matrix'
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
