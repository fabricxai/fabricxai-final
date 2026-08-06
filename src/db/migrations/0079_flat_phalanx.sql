CREATE TYPE "public"."model_role" AS ENUM('extract', 'reason', 'embed');--> statement-breakpoint
CREATE TABLE "marbim_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role" "model_role" NOT NULL,
	"model" text NOT NULL,
	"conversation_id" uuid,
	"iteration" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer NOT NULL,
	"outcome" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marbim_call_log_iteration_nonneg" CHECK ("marbim_call_log"."iteration" >= 0),
	CONSTRAINT "marbim_call_log_tokens_nonneg" CHECK (("marbim_call_log"."input_tokens" IS NULL OR "marbim_call_log"."input_tokens" >= 0) AND ("marbim_call_log"."output_tokens" IS NULL OR "marbim_call_log"."output_tokens" >= 0))
);
--> statement-breakpoint
ALTER TABLE "marbim_call_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "marbim_call_log" ADD CONSTRAINT "marbim_call_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marbim_call_log" ADD CONSTRAINT "marbim_call_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marbim_call_log_company_created_idx" ON "marbim_call_log" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "marbim_call_log_conversation_idx" ON "marbim_call_log" USING btree ("conversation_id");--> statement-breakpoint
-- Tenant isolation for the call log (plan 6.5, audit AI-H4).
--
-- FORCE, like every other ⚖-adjacent table: the log is what the daily ceiling counts, and a
-- superuser-owned connection reading past the policy would let one company's spend be
-- charged against another's budget. Same shape as 0054's, deliberately — a table that
-- records what a model did belongs under the same wall as the tables recording what it said.
ALTER TABLE "marbim_call_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "marbim_call_log_tenant_isolation" ON "marbim_call_log" FOR ALL TO fabricxai_app
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
