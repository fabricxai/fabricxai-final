CREATE TYPE "public"."extraction_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'rejected');--> statement-breakpoint
CREATE TABLE "chat_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_change_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"model" text,
	"primer_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_turns_index_nonneg" CHECK ("chat_turns"."turn_index" >= 0)
);
--> statement-breakpoint
ALTER TABLE "chat_turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"target_table" text NOT NULL,
	"zod_schema_key" text NOT NULL,
	"extractor_name" text NOT NULL,
	"extractor_version" text NOT NULL,
	"model" text,
	"source_document_id" uuid,
	"source_text" text,
	"status" "extraction_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"pending_change_id" uuid,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_jobs_attempts_nonneg" CHECK ("extraction_jobs"."attempts" >= 0),
	CONSTRAINT "extraction_jobs_finished_has_status" CHECK ("extraction_jobs"."finished_at" IS NULL OR "extraction_jobs"."status" IN ('succeeded', 'failed', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "extraction_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_turns_conversation_index_key" ON "chat_turns" USING btree ("conversation_id","turn_index");--> statement-breakpoint
CREATE INDEX "chat_turns_company_created_idx" ON "chat_turns" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_turns_conversation_idx" ON "chat_turns" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "extraction_jobs_company_status_idx" ON "extraction_jobs" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "extraction_jobs_extractor_idx" ON "extraction_jobs" USING btree ("company_id","extractor_name","extractor_version");--> statement-breakpoint
CREATE INDEX "extraction_jobs_pending_change_idx" ON "extraction_jobs" USING btree ("pending_change_id");--> statement-breakpoint
CREATE INDEX "extraction_jobs_company_created_idx" ON "extraction_jobs" USING btree ("company_id","created_at" DESC NULLS LAST);