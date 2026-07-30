CREATE TYPE "public"."defect_severity" AS ENUM('critical', 'major', 'minor');--> statement-breakpoint
CREATE TYPE "public"."final_inspection_status" AS ENUM('draft', 'submitted', 'reinspection_required', 'closed');--> statement-breakpoint
CREATE TYPE "public"."inspection_agency" AS ENUM('sgs', 'intertek', 'bv', 'other');--> statement-breakpoint
CREATE TYPE "public"."inspection_result" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TABLE "aql_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard" text NOT NULL,
	"inspection_level" text NOT NULL,
	"aql_level" text NOT NULL,
	"lot_from" integer NOT NULL,
	"lot_to" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"accept" integer NOT NULL,
	"reject" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aql_tables_range_ordered" CHECK ("aql_tables"."lot_to" >= "aql_tables"."lot_from"),
	CONSTRAINT "aql_tables_reject_above_accept" CHECK ("aql_tables"."reject" > "aql_tables"."accept")
);
--> statement-breakpoint
CREATE TABLE "defect_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"severity" "defect_severity" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "defect_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dhu_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"dhu_date" date NOT NULL,
	"defects" integer NOT NULL,
	"checked" integer NOT NULL,
	"dhu" numeric(8, 2) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dhu_daily_checked_positive" CHECK ("dhu_daily"."checked" > 0)
);
--> statement-breakpoint
ALTER TABLE "dhu_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fabric_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"grn_id" uuid NOT NULL,
	"roll_id" uuid,
	"points_4" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inspected_length_yards" numeric(12, 2) NOT NULL,
	"width_inches" numeric(6, 2) NOT NULL,
	"total_points" integer NOT NULL,
	"points_per_100_sq_yd" numeric(8, 2) NOT NULL,
	"threshold_per_100_sq_yd" numeric(8, 2) NOT NULL,
	"result" "inspection_result" NOT NULL,
	"inspected_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fabric_inspections_length_positive" CHECK ("fabric_inspections"."inspected_length_yards" > 0),
	CONSTRAINT "fabric_inspections_width_positive" CHECK ("fabric_inspections"."width_inches" > 0)
);
--> statement-breakpoint
ALTER TABLE "fabric_inspections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "final_inspection_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"final_inspection_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "final_inspection_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "final_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_style_id" uuid,
	"inspection_no" text NOT NULL,
	"lot_qty" integer NOT NULL,
	"standard" text NOT NULL,
	"inspection_level" text NOT NULL,
	"major_aql" text NOT NULL,
	"minor_aql" text NOT NULL,
	"sample_size" integer NOT NULL,
	"major_accept" integer NOT NULL,
	"minor_accept" integer NOT NULL,
	"hundred_percent" boolean DEFAULT false NOT NULL,
	"critical_found" integer DEFAULT 0 NOT NULL,
	"major_found" integer DEFAULT 0 NOT NULL,
	"minor_found" integer DEFAULT 0 NOT NULL,
	"defects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verdict" "inspection_result" NOT NULL,
	"fail_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "final_inspection_status" DEFAULT 'draft' NOT NULL,
	"inspected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inspected_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "final_inspections_lot_positive" CHECK ("final_inspections"."lot_qty" > 0),
	CONSTRAINT "final_inspections_sample_positive" CHECK ("final_inspections"."sample_size" > 0),
	CONSTRAINT "final_inspections_counts_nonneg" CHECK ("final_inspections"."critical_found" >= 0 AND "final_inspections"."major_found" >= 0 AND "final_inspections"."minor_found" >= 0)
);
--> statement-breakpoint
ALTER TABLE "final_inspections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inline_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"order_id" uuid,
	"checked_on" date NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"operation" text NOT NULL,
	"operator_id" uuid,
	"checked_qty" integer NOT NULL,
	"defects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"defect_qty" integer DEFAULT 0 NOT NULL,
	"offline_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inline_checks_checked_positive" CHECK ("inline_checks"."checked_qty" > 0),
	CONSTRAINT "inline_checks_defects_nonneg" CHECK ("inline_checks"."defect_qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inline_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "measurement_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"measurement_spec_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sampled_size" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"out_of_tolerance" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_points" text[] DEFAULT '{}'::text[] NOT NULL,
	"result" "inspection_result" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "measurement_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "measurement_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"style_code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unit" text DEFAULT 'cm' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_specs_version_positive" CHECK ("measurement_specs"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "measurement_specs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "third_party_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"agency" "inspection_agency" NOT NULL,
	"agency_name" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"result" "inspection_result",
	"result_at" timestamp with time zone,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "third_party_inspections_other_needs_name" CHECK ("third_party_inspections"."agency" <> 'other' OR "third_party_inspections"."agency_name" IS NOT NULL),
	CONSTRAINT "third_party_inspections_result_needs_date" CHECK ("third_party_inspections"."result" IS NULL OR "third_party_inspections"."result_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "third_party_inspections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "defect_codes" ADD CONSTRAINT "defect_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dhu_daily" ADD CONSTRAINT "dhu_daily_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dhu_daily" ADD CONSTRAINT "dhu_daily_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabric_inspections" ADD CONSTRAINT "fabric_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabric_inspections" ADD CONSTRAINT "fabric_inspections_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabric_inspections" ADD CONSTRAINT "fabric_inspections_roll_id_rolls_id_fk" FOREIGN KEY ("roll_id") REFERENCES "public"."rolls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabric_inspections" ADD CONSTRAINT "fabric_inspections_inspected_by_users_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_inspection_photos" ADD CONSTRAINT "final_inspection_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_inspection_photos" ADD CONSTRAINT "final_inspection_photos_final_inspection_id_final_inspections_id_fk" FOREIGN KEY ("final_inspection_id") REFERENCES "public"."final_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_inspection_photos" ADD CONSTRAINT "final_inspection_photos_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_inspections" ADD CONSTRAINT "final_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_inspections" ADD CONSTRAINT "final_inspections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_inspections" ADD CONSTRAINT "final_inspections_order_style_id_order_styles_id_fk" FOREIGN KEY ("order_style_id") REFERENCES "public"."order_styles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_inspections" ADD CONSTRAINT "final_inspections_inspected_by_users_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inline_checks" ADD CONSTRAINT "inline_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inline_checks" ADD CONSTRAINT "inline_checks_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inline_checks" ADD CONSTRAINT "inline_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inline_checks" ADD CONSTRAINT "inline_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_checks" ADD CONSTRAINT "measurement_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_checks" ADD CONSTRAINT "measurement_checks_measurement_spec_id_measurement_specs_id_fk" FOREIGN KEY ("measurement_spec_id") REFERENCES "public"."measurement_specs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_checks" ADD CONSTRAINT "measurement_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_checks" ADD CONSTRAINT "measurement_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_specs" ADD CONSTRAINT "measurement_specs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_specs" ADD CONSTRAINT "measurement_specs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "third_party_inspections" ADD CONSTRAINT "third_party_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "third_party_inspections" ADD CONSTRAINT "third_party_inspections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "third_party_inspections" ADD CONSTRAINT "third_party_inspections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "third_party_inspections" ADD CONSTRAINT "third_party_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aql_tables_lookup_key" ON "aql_tables" USING btree ("standard","inspection_level","aql_level","lot_from");--> statement-breakpoint
CREATE INDEX "aql_tables_range_idx" ON "aql_tables" USING btree ("standard","inspection_level","aql_level","lot_from","lot_to");--> statement-breakpoint
CREATE UNIQUE INDEX "defect_codes_company_code_key" ON "defect_codes" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "defect_codes_company_category_idx" ON "defect_codes" USING btree ("company_id","category","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "dhu_daily_line_date_key" ON "dhu_daily" USING btree ("line_id","dhu_date");--> statement-breakpoint
CREATE INDEX "dhu_daily_company_date_idx" ON "dhu_daily" USING btree ("company_id","dhu_date");--> statement-breakpoint
CREATE INDEX "fabric_inspections_company_grn_idx" ON "fabric_inspections" USING btree ("company_id","grn_id");--> statement-breakpoint
CREATE INDEX "fabric_inspections_roll_idx" ON "fabric_inspections" USING btree ("roll_id");--> statement-breakpoint
CREATE INDEX "fabric_inspections_company_result_idx" ON "fabric_inspections" USING btree ("company_id","result");--> statement-breakpoint
CREATE UNIQUE INDEX "final_inspection_photos_key" ON "final_inspection_photos" USING btree ("final_inspection_id","document_id");--> statement-breakpoint
CREATE INDEX "final_inspection_photos_company_idx" ON "final_inspection_photos" USING btree ("company_id","final_inspection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "final_inspections_company_no_key" ON "final_inspections" USING btree ("company_id","inspection_no");--> statement-breakpoint
CREATE INDEX "final_inspections_company_order_idx" ON "final_inspections" USING btree ("company_id","order_id","inspected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "final_inspections_company_verdict_idx" ON "final_inspections" USING btree ("company_id","verdict","inspected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inline_checks_offline_key" ON "inline_checks" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inline_checks_company_line_date_idx" ON "inline_checks" USING btree ("company_id","line_id","checked_on");--> statement-breakpoint
CREATE INDEX "inline_checks_company_date_idx" ON "inline_checks" USING btree ("company_id","checked_on");--> statement-breakpoint
CREATE INDEX "inline_checks_company_operation_idx" ON "inline_checks" USING btree ("company_id","operation","checked_on");--> statement-breakpoint
CREATE INDEX "measurement_checks_company_order_idx" ON "measurement_checks" USING btree ("company_id","order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "measurement_checks_company_result_idx" ON "measurement_checks" USING btree ("company_id","result");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_specs_company_style_version_key" ON "measurement_specs" USING btree ("company_id","style_code","version");--> statement-breakpoint
CREATE INDEX "measurement_specs_company_style_idx" ON "measurement_specs" USING btree ("company_id","style_code");--> statement-breakpoint
CREATE INDEX "third_party_inspections_company_order_idx" ON "third_party_inspections" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "third_party_inspections_company_scheduled_idx" ON "third_party_inspections" USING btree ("company_id","scheduled_at");