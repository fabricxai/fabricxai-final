-- The five identity tables had NO row level security and the app role holds DML on all of
-- them (audit N2, 2026-08-05). From inside any tenant-scoped transaction — which is where
-- every service in this codebase runs — the app role could read every other factory's user
-- emails, their session tokens and their credential rows, and UPDATE users. `0002` said
-- "enumeration is prevented in the service layer"; there is no such code. It was prevented
-- by nobody having written the query.
--
-- ── The constraint that shapes all of this ───────────────────────────────────────────────
-- Better Auth owns these tables and queries them on the pooled handle OUTSIDE
-- `withTenantTx`, so `app.current_company_id()` is NULL on its path. Login must find a user
-- by email before any company context exists — that is structural, not an oversight. A
-- conventional `company_id = app.current_company_id()` policy would therefore deny every
-- authentication in the system while looking like it granted something. That is exactly the
-- trap `0069` documented for `invitations`, which could only be deny-all because invites are
-- unexercised. These five are load-bearing, so deny-all is not available.
--
-- ── The decision ─────────────────────────────────────────────────────────────────────────
-- Scope-conditional policies. With NO tenant scope set, these behave as they do today, which
-- is what keeps Better Auth working. With a scope set, they close down:
--
--   users, profiles      → only people who share the scoped company (via `roles`)
--   accounts, sessions,  → NOTHING. No service has any business reading a password hash,
--   verifications          a session token or an email-verification token, and none does.
--
-- Read honestly, this is a wall around all MODULE code rather than an absolute one: a future
-- query that runs on the pooled handle without a scope still sees everything, the same door
-- Better Auth walks through. It is not a fig leaf either — every service, job and action in
-- this repo runs inside `withTenantTx`/`withTenantRead`, so it closes the entire realistic
-- path, which today is wide open. Closing the door completely means giving Better Auth its
-- own database role and connection, and that is a change to the auth architecture rather
-- than a policy.
--
-- ── Two things that will bite whoever edits this next ─────────────────────────────────────
-- 1. `users` and `profiles` are keyed on membership in `roles`, NOT on a company column,
--    because neither table has one — a person belongs to a factory by holding a role in it.
--    Membership is not filtered on `revoked_at`: a removed employee must still resolve to a
--    name in an audit trail and an approval history, or the record of what they did becomes
--    anonymous.
-- 2. Signup inserts `profiles` INSIDE a scoped transaction (`lib/auth.ts`, the
--    `user.create.after` hook) and inserts the `roles` row immediately BEFORE it. The
--    profile insert therefore passes this policy only because that ordering holds within the
--    transaction. Swap those two statements and signup fails with an RLS violation. The
--    integration suite signs up eight actors on every run, so the breakage is loud.

-- ── users ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_same_company" ON "users"
  FOR ALL TO fabricxai_app
  USING (
    app.current_company_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM roles r
      WHERE r.user_id = "users"."id" AND r.company_id = app.current_company_id()
    )
  )
  WITH CHECK (
    app.current_company_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM roles r
      WHERE r.user_id = "users"."id" AND r.company_id = app.current_company_id()
    )
  );--> statement-breakpoint

-- ── profiles ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "profiles_same_company" ON "profiles"
  FOR ALL TO fabricxai_app
  USING (
    app.current_company_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM roles r
      WHERE r.user_id = "profiles"."user_id" AND r.company_id = app.current_company_id()
    )
  )
  WITH CHECK (
    app.current_company_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM roles r
      WHERE r.user_id = "profiles"."user_id" AND r.company_id = app.current_company_id()
    )
  );--> statement-breakpoint

-- ── accounts · sessions · verifications ──────────────────────────────────────────────────
-- Password hashes, live session tokens, and email-verification/reset tokens. Nothing inside
-- a tenant scope reads these, so the policy says so rather than trusting that it stays true.
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_unscoped_only" ON "accounts"
  FOR ALL TO fabricxai_app
  USING (app.current_company_id() IS NULL)
  WITH CHECK (app.current_company_id() IS NULL);--> statement-breakpoint

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sessions_unscoped_only" ON "sessions"
  FOR ALL TO fabricxai_app
  USING (app.current_company_id() IS NULL)
  WITH CHECK (app.current_company_id() IS NULL);--> statement-breakpoint

ALTER TABLE "verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "verifications_unscoped_only" ON "verifications"
  FOR ALL TO fabricxai_app
  USING (app.current_company_id() IS NULL)
  WITH CHECK (app.current_company_id() IS NULL);
