CREATE TYPE "public"."bundle_status" AS ENUM('created', 'in_sewing', 'done');--> statement-breakpoint
CREATE TYPE "public"."lay_status" AS ENUM('open', 'cut', 'cancelled');--> statement-breakpoint
CREATE TABLE "bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"cut_report_id" uuid NOT NULL,
	"bundle_no" text NOT NULL,
	"color" text NOT NULL,
	"size" text NOT NULL,
	"qty" integer NOT NULL,
	"qr_token" text NOT NULL,
	"status" "bundle_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundles_qty_positive" CHECK ("bundles"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "bundles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cut_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lay_id" uuid NOT NULL,
	"cells" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"breakdown_revision" integer NOT NULL,
	"tolerance_pct" numeric(5, 2) NOT NULL,
	"variances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offline_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cut_reports_revision_positive" CHECK ("cut_reports"."breakdown_revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "cut_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cut_wastage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"fabric_drawn" numeric(14, 2) NOT NULL,
	"marker_consumption" numeric(14, 2) NOT NULL,
	"wastage_pct" numeric(7, 2) NOT NULL,
	"unit" text DEFAULT 'm' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cut_wastage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_style_id" uuid NOT NULL,
	"marker_id" uuid NOT NULL,
	"lay_no" text NOT NULL,
	"color" text NOT NULL,
	"plies" integer NOT NULL,
	"lay_length_meters" numeric(12, 2) NOT NULL,
	"rolls_drawn" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"fabric_drawn_meters" numeric(12, 2),
	"status" "lay_status" DEFAULT 'open' NOT NULL,
	"offline_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lays_plies_positive" CHECK ("lays"."plies" > 0),
	CONSTRAINT "lays_length_positive" CHECK ("lays"."lay_length_meters" > 0)
);
--> statement-breakpoint
ALTER TABLE "lays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"style_code" text NOT NULL,
	"size_ratio" jsonb NOT NULL,
	"efficiency_pct" numeric(5, 2),
	"fabric_width_inches" numeric(6, 2),
	"lay_length_meters" numeric(12, 2) NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markers_lay_length_positive" CHECK ("markers"."lay_length_meters" > 0),
	CONSTRAINT "markers_efficiency_range" CHECK ("markers"."efficiency_pct" IS NULL OR ("markers"."efficiency_pct" > 0 AND "markers"."efficiency_pct" <= 100))
);
--> statement-breakpoint
ALTER TABLE "markers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_cut_report_id_cut_reports_id_fk" FOREIGN KEY ("cut_report_id") REFERENCES "public"."cut_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cut_reports" ADD CONSTRAINT "cut_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cut_reports" ADD CONSTRAINT "cut_reports_lay_id_lays_id_fk" FOREIGN KEY ("lay_id") REFERENCES "public"."lays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cut_reports" ADD CONSTRAINT "cut_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cut_wastage" ADD CONSTRAINT "cut_wastage_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cut_wastage" ADD CONSTRAINT "cut_wastage_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lays" ADD CONSTRAINT "lays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lays" ADD CONSTRAINT "lays_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lays" ADD CONSTRAINT "lays_order_style_id_order_styles_id_fk" FOREIGN KEY ("order_style_id") REFERENCES "public"."order_styles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lays" ADD CONSTRAINT "lays_marker_id_markers_id_fk" FOREIGN KEY ("marker_id") REFERENCES "public"."markers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lays" ADD CONSTRAINT "lays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markers" ADD CONSTRAINT "markers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markers" ADD CONSTRAINT "markers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bundles_report_no_key" ON "bundles" USING btree ("cut_report_id","bundle_no");--> statement-breakpoint
CREATE UNIQUE INDEX "bundles_qr_token_key" ON "bundles" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "bundles_company_status_idx" ON "bundles" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "bundles_company_report_idx" ON "bundles" USING btree ("company_id","cut_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cut_reports_lay_key" ON "cut_reports" USING btree ("lay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cut_reports_offline_key" ON "cut_reports" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cut_reports_company_created_idx" ON "cut_reports" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "cut_wastage_order_key" ON "cut_wastage" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cut_wastage_company_idx" ON "cut_wastage" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lays_company_lay_no_key" ON "lays" USING btree ("company_id","lay_no");--> statement-breakpoint
CREATE UNIQUE INDEX "lays_offline_key" ON "lays" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lays_company_order_idx" ON "lays" USING btree ("company_id","order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lays_company_status_idx" ON "lays" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "markers_company_code_key" ON "markers" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "markers_company_style_idx" ON "markers" USING btree ("company_id","style_code");