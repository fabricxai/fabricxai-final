CREATE TYPE "public"."exception_kind" AS ENUM('lc_conflict', 'tna_risk', 'cap_critical', 'runrate_miss', 'approval_waiting', 'payroll_anomaly');--> statement-breakpoint
CREATE TYPE "public"."exception_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('csv', 'xlsx', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."export_period" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "exceptions_feed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "exception_kind" NOT NULL,
	"ref" uuid NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"severity" "exception_severity" NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "exceptions_feed_resolved_after_since" CHECK ("exceptions_feed"."resolved_at" IS NULL OR "exceptions_feed"."resolved_at" >= "exceptions_feed"."since")
);
--> statement-breakpoint
ALTER TABLE "exceptions_feed" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scheduled_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"saved_report_id" uuid NOT NULL,
	"period" "export_period" NOT NULL,
	"format" "export_format" NOT NULL,
	"recipients" text[] NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_exports_has_recipients" CHECK (array_length("scheduled_exports"."recipients", 1) >= 1)
);
--> statement-breakpoint
ALTER TABLE "scheduled_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exceptions_feed" ADD CONSTRAINT "exceptions_feed_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_exports" ADD CONSTRAINT "scheduled_exports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_exports" ADD CONSTRAINT "scheduled_exports_saved_report_id_saved_reports_id_fk" FOREIGN KEY ("saved_report_id") REFERENCES "public"."saved_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_exports" ADD CONSTRAINT "scheduled_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exceptions_feed_company_kind_ref_key" ON "exceptions_feed" USING btree ("company_id","kind","ref");--> statement-breakpoint
CREATE INDEX "exceptions_feed_company_open_idx" ON "exceptions_feed" USING btree ("company_id","severity","since") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_reports_company_name_key" ON "saved_reports" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "scheduled_exports_company_next_idx" ON "scheduled_exports" USING btree ("company_id","next_run_at");