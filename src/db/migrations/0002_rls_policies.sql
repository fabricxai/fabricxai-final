-- ============================================================================
-- Tenancy, second wall (architecture §1.2, dev-plan §2.2.1).
--
-- Wall 1 is the application: every service function takes `ctx {companyId, …}` and
-- the core repo helpers scope every query. Wall 2 is this file. Either wall alone
-- stops a bug; both together stop a bug PLUS a bypass.
--
-- The session variable is set per transaction (`SET LOCAL app.company_id = …`) —
-- never per connection, because PgBouncer runs in transaction mode and hands the
-- same server connection to the next client the moment a transaction ends.
--
-- Fail-closed by construction: with the GUC unset, app.current_company_id() returns
-- NULL, every policy predicate evaluates to NULL, and every query returns zero rows.
-- A forgotten SET LOCAL produces an empty screen, never another tenant's data.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;

COMMENT ON SCHEMA app IS
  'Tenancy helpers. Distinct from the app.* GUC namespace used by SET LOCAL.';

-- STABLE, not IMMUTABLE: the value changes between transactions, but is constant
-- within one — which is exactly what the planner needs to use it in an index scan.
CREATE OR REPLACE FUNCTION app.current_company_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;

COMMENT ON FUNCTION app.current_company_id() IS
  'Company scope for the current transaction. NULL when unset, which makes every RLS policy deny.';

-- ----------------------------------------------------------------------------
-- The application role.
--
-- NOLOGIN on purpose: it is a privilege bundle, not an account. Ops creates the
-- actual login user and runs `GRANT fabricxai_app TO <login_user>` — so the password
-- never lives in a migration file, and the login user is trivially rotatable.
--
-- Critically it is NOT the table owner and NOT a superuser, so RLS genuinely applies
-- to it. Migrations keep running as the owner, which is why FORCE ROW LEVEL SECURITY
-- below does not lock the migration runner out of its own tables.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabricxai_app') THEN
    CREATE ROLE fabricxai_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO fabricxai_app;
GRANT USAGE ON SCHEMA app TO fabricxai_app;
GRANT EXECUTE ON FUNCTION app.current_company_id() TO fabricxai_app;

-- ----------------------------------------------------------------------------
-- Table privileges. Deliberately not uniform — some tables are append-only by
-- privilege, not merely by convention.
-- ----------------------------------------------------------------------------

-- Identity: not tenant-scoped (login must read it before any company context
-- exists), so it carries no policy. Enumeration is prevented in the service layer.
GRANT SELECT, INSERT, UPDATE ON TABLE users, profiles TO fabricxai_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  companies, roles, documents, pending_changes, approval_rules, notifications
  TO fabricxai_app;

-- Outbox: the relay marks rows published, nothing deletes them from the app.
GRANT SELECT, INSERT, UPDATE ON TABLE outbox TO fabricxai_app;

-- Audit log is append-only, enforced by privilege rather than trust. No UPDATE,
-- no DELETE — retention is an ops action taken as the owner (CLAUDE.md rule 10).
GRANT SELECT, INSERT ON TABLE audit_log TO fabricxai_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO fabricxai_app;

-- Worker idempotency ledger: infrastructure, keyed by globally unique event id.
GRANT SELECT, INSERT, DELETE ON TABLE processed_events TO fabricxai_app;

-- Module tables land later; make sure they inherit sane defaults instead of relying
-- on whoever writes the next migration remembering this file.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fabricxai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fabricxai_app;

-- ----------------------------------------------------------------------------
-- Policies. RLS was enabled on these tables in 0001; FORCE makes it apply even to
-- the table owner, so a future "just run it as the owner" shortcut cannot quietly
-- become a tenancy hole.
-- ----------------------------------------------------------------------------

-- The tenant root. A company row is visible only from inside that company's scope.
-- Company creation itself runs on the privileged (owner) connection at signup —
-- it is by definition the one write that has no company scope yet.
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_tenant_isolation ON companies
  FOR ALL TO fabricxai_app
  USING (id = app.current_company_id())
  WITH CHECK (id = app.current_company_id());

ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant_isolation ON roles
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant_isolation ON documents
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

ALTER TABLE pending_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY pending_changes_tenant_isolation ON pending_changes
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

ALTER TABLE approval_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_rules_tenant_isolation ON approval_rules
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON notifications
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_tenant_isolation ON outbox
  FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

-- Audit log: readable and insertable within scope only. The absence of UPDATE and
-- DELETE grants above is what makes it append-only; the policy handles the tenancy.
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant_read ON audit_log
  FOR SELECT TO fabricxai_app
  USING (company_id = app.current_company_id());
CREATE POLICY audit_log_tenant_insert ON audit_log
  FOR INSERT TO fabricxai_app
  WITH CHECK (company_id = app.current_company_id());
