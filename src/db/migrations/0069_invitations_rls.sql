-- `invitations` was the ONE table carrying a company FK with no row level security at
-- all (audit DB-H2). It also carries a `role`: accepting an invitation mints a `roles`
-- row, so an IDOR in the accept path was a cross-tenant privilege escalation with no
-- second wall behind it.
--
-- Deny-all ON PURPOSE, not a tenant policy. Better Auth's organization plugin queries
-- this table on the pooled handle OUTSIDE withTenantTx, where `app.current_company_id()`
-- is NULL — a conventional tenant policy would deny those queries anyway while looking
-- like it granted something. Invitations are unexercised until X.3 Settings ships
-- (docs/STUBS.md: one-factory-per-owner, invites disabled); when X.3 lands, it must
-- either route these queries through a scoped transaction and add the policy, or expose
-- acceptance through a narrow SECURITY DEFINER token lookup.
--
-- Note the column is organization_id, not company_id, so the seed's isolation sweep
-- (which keys on company_id) does not cover this table — this migration is the wall.
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
