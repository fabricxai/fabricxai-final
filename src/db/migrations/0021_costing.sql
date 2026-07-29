CREATE TYPE "public"."bom_group" AS ENUM('fabric', 'trims', 'packing', 'embellishment');--> statement-breakpoint
CREATE TYPE "public"."bom_source" AS ENUM('tech_pack_extract', 'manual', 'seeded');--> statement-breakpoint
CREATE TYPE "public"."cost_sheet_status" AS ENUM('draft', 'approved', 'superseded');--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bom_id" uuid NOT NULL,
	"line_group" "bom_group" NOT NULL,
	"item_ref" text,
	"spec" text,
	"consumption" numeric(12, 4) NOT NULL,
	"uom" text NOT NULL,
	"wastage_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"source_document_id" uuid,
	"source_page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bom_lines_consumption_positive" CHECK ("bom_lines"."consumption" > 0),
	CONSTRAINT "bom_lines_wastage_range" CHECK ("bom_lines"."wastage_pct" >= 0 AND "bom_lines"."wastage_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "bom_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"style_code" text NOT NULL,
	"source" "bom_source" DEFAULT 'manual' NOT NULL,
	"source_document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consumption_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_type" text NOT NULL,
	"params" jsonb NOT NULL,
	"updated_from_order_id" uuid,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumption_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cost_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bom_id" uuid,
	"style_code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "cost_sheet_status" DEFAULT 'draft' NOT NULL,
	"sections" jsonb NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"local_currency" text DEFAULT 'BDT' NOT NULL,
	"fx_rate_local_to_base" numeric(12, 6) NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"fob_price" numeric(14, 2) NOT NULL,
	"cm_local_per_piece" numeric(14, 2) NOT NULL,
	"margin_pct" numeric(6, 2) NOT NULL,
	"achieved_margin_pct" numeric(6, 2) NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_sheets_currency_iso" CHECK (char_length("cost_sheets"."currency") = 3),
	CONSTRAINT "cost_sheets_fx_positive" CHECK ("cost_sheets"."fx_rate_local_to_base" > 0),
	CONSTRAINT "cost_sheets_version_positive" CHECK ("cost_sheets"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "cost_sheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_templates" ADD CONSTRAINT "consumption_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_sheets" ADD CONSTRAINT "cost_sheets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_sheets" ADD CONSTRAINT "cost_sheets_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_sheets" ADD CONSTRAINT "cost_sheets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_sheets" ADD CONSTRAINT "cost_sheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_lines_company_bom_idx" ON "bom_lines" USING btree ("company_id","bom_id","line_group");--> statement-breakpoint
CREATE INDEX "boms_company_style_idx" ON "boms" USING btree ("company_id","style_code");--> statement-breakpoint
CREATE UNIQUE INDEX "consumption_templates_company_type_key" ON "consumption_templates" USING btree ("company_id","product_type");--> statement-breakpoint
CREATE INDEX "consumption_templates_company_updated_idx" ON "consumption_templates" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_sheets_company_style_version_key" ON "cost_sheets" USING btree ("company_id","style_code","version");--> statement-breakpoint
CREATE INDEX "cost_sheets_company_status_idx" ON "cost_sheets" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "cost_sheets_company_style_idx" ON "cost_sheets" USING btree ("company_id","style_code");