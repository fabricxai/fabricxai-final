CREATE TYPE "public"."audit_regime" AS ENUM('rsc', 'bsci', 'sedex', 'buyer', 'government');--> statement-breakpoint
CREATE TYPE "public"."cap_status" AS ENUM('open', 'in_progress', 'evidence_submitted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('critical', 'major', 'minor', 'observation');--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"regime" "audit_regime" NOT NULL,
	"auditor" text NOT NULL,
	"audited_on" date NOT NULL,
	"report_document_id" uuid,
	"score" numeric(6, 2),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "caps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"owner_user_id" text,
	"deadline" date NOT NULL,
	"status" "cap_status" DEFAULT 'open' NOT NULL,
	"closure_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"milestones" jsonb,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caps_closed_has_time" CHECK ("caps"."status" <> 'closed' OR "caps"."closed_at" IS NOT NULL),
	CONSTRAINT "caps_closed_has_evidence" CHECK ("caps"."status" <> 'closed' OR jsonb_array_length("caps"."closure_evidence") > 0)
);
--> statement-breakpoint
ALTER TABLE "caps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_expiry_after_issue" CHECK ("certificates"."expires_on" IS NULL OR "certificates"."issued_on" IS NULL OR "certificates"."expires_on" >= "certificates"."issued_on")
);
--> statement-breakpoint
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"text" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_page" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"held_on" date NOT NULL,
	"attendees_count" integer NOT NULL,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainings_attendees_positive" CHECK ("trainings"."attendees_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "trainings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_report_document_id_documents_id_fk" FOREIGN KEY ("report_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caps" ADD CONSTRAINT "caps_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caps" ADD CONSTRAINT "caps_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caps" ADD CONSTRAINT "caps_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caps" ADD CONSTRAINT "caps_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caps" ADD CONSTRAINT "caps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audits_company_regime_idx" ON "audits" USING btree ("company_id","regime","audited_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audits_company_date_idx" ON "audits" USING btree ("company_id","audited_on" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "caps_finding_key" ON "caps" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "caps_company_status_idx" ON "caps" USING btree ("company_id","status","deadline");--> statement-breakpoint
CREATE INDEX "caps_company_owner_idx" ON "caps" USING btree ("company_id","owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_company_kind_number_key" ON "certificates" USING btree ("company_id","kind","number");--> statement-breakpoint
CREATE INDEX "certificates_company_expiry_idx" ON "certificates" USING btree ("company_id","expires_on");--> statement-breakpoint
CREATE INDEX "findings_company_audit_idx" ON "findings" USING btree ("company_id","audit_id","severity");--> statement-breakpoint
CREATE INDEX "findings_company_severity_idx" ON "findings" USING btree ("company_id","severity");--> statement-breakpoint
CREATE INDEX "trainings_company_kind_idx" ON "trainings" USING btree ("company_id","kind","held_on" DESC NULLS LAST);