CREATE TYPE "public"."ud_status" AS ENUM('active', 'exhausted', 'expired', 'closed');--> statement-breakpoint
CREATE TABLE "ud_consumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ud_id" uuid NOT NULL,
	"store_issue_id" uuid,
	"item_ref" text NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"override_of" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ud_consumptions_qty_positive" CHECK ("ud_consumptions"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "ud_consumptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ud_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ud_id" uuid NOT NULL,
	"period" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"generated_document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ud_reconciliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "uds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issue_date" date,
	"valid_until" date,
	"authorized_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "ud_status" DEFAULT 'active' NOT NULL,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ud_consumptions" ADD CONSTRAINT "ud_consumptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ud_consumptions" ADD CONSTRAINT "ud_consumptions_ud_id_uds_id_fk" FOREIGN KEY ("ud_id") REFERENCES "public"."uds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ud_consumptions" ADD CONSTRAINT "ud_consumptions_override_of_uds_id_fk" FOREIGN KEY ("override_of") REFERENCES "public"."uds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ud_consumptions" ADD CONSTRAINT "ud_consumptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ud_reconciliations" ADD CONSTRAINT "ud_reconciliations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ud_reconciliations" ADD CONSTRAINT "ud_reconciliations_ud_id_uds_id_fk" FOREIGN KEY ("ud_id") REFERENCES "public"."uds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ud_reconciliations" ADD CONSTRAINT "ud_reconciliations_generated_document_id_documents_id_fk" FOREIGN KEY ("generated_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ud_reconciliations" ADD CONSTRAINT "ud_reconciliations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uds" ADD CONSTRAINT "uds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uds" ADD CONSTRAINT "uds_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uds" ADD CONSTRAINT "uds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ud_consumptions_ud_idx" ON "ud_consumptions" USING btree ("company_id","ud_id","item_ref");--> statement-breakpoint
CREATE INDEX "ud_consumptions_store_issue_idx" ON "ud_consumptions" USING btree ("store_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ud_reconciliations_ud_period_key" ON "ud_reconciliations" USING btree ("ud_id","period");--> statement-breakpoint
CREATE INDEX "ud_reconciliations_company_period_idx" ON "ud_reconciliations" USING btree ("company_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "uds_company_number_key" ON "uds" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "uds_company_valid_until_idx" ON "uds" USING btree ("company_id","status","valid_until");