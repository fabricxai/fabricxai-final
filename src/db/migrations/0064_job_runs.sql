CREATE TYPE "public"."job_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"task" text NOT NULL,
	"status" "job_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"result" jsonb,
	"error" text,
	"job_id" text,
	CONSTRAINT "job_runs_finished_has_status" CHECK ("job_runs"."finished_at" IS NULL OR "job_runs"."status" <> 'running')
);
--> statement-breakpoint
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_runs_company_task_idx" ON "job_runs" USING btree ("company_id","task","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_runs_started_idx" ON "job_runs" USING btree ("started_at");