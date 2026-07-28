CREATE TYPE "public"."lc_status" AS ENUM('draft', 'active', 'expired', 'closed');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('pending', 'on_track', 'at_risk', 'late', 'done');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('confirmed', 'in_production', 'shipped_partial', 'shipped_full', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "btb_lcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"master_lc_id" uuid NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid,
	"value" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"opened_at" date,
	"expiry_date" date,
	"status" "lc_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "btb_lcs_currency_iso" CHECK (char_length("btb_lcs"."currency") = 3),
	CONSTRAINT "btb_lcs_value_positive" CHECK ("btb_lcs"."value" > 0)
);
--> statement-breakpoint
ALTER TABLE "btb_lcs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"number" text NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"tolerance_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"issue_date" date,
	"latest_shipment_date" date,
	"expiry_date" date,
	"docs_required" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "lc_status" DEFAULT 'draft' NOT NULL,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lcs_currency_iso" CHECK (char_length("lcs"."currency") = 3),
	CONSTRAINT "lcs_value_positive" CHECK ("lcs"."value" > 0),
	CONSTRAINT "lcs_expiry_after_latest_shipment" CHECK ("lcs"."expiry_date" IS NULL OR "lcs"."latest_shipment_date" IS NULL
        OR "lcs"."expiry_date" >= "lcs"."latest_shipment_date")
);
--> statement-breakpoint
ALTER TABLE "lcs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_breakdowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_style_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"color" text NOT NULL,
	"size" text NOT NULL,
	"qty" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_breakdowns_qty_positive" CHECK ("order_breakdowns"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_breakdowns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_lcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"lc_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_lcs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"diff" jsonb NOT NULL,
	"reason" text,
	"buyer_confirmed_at" timestamp with time zone,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_revisions_revision_positive" CHECK ("order_revisions"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "order_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_styles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"style_code" text NOT NULL,
	"description" text,
	"unit_price" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"active_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_styles_currency_iso" CHECK (char_length("order_styles"."currency") = 3),
	CONSTRAINT "order_styles_active_revision_positive" CHECK ("order_styles"."active_revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "order_styles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"po_numbers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"total_value" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"agent_snapshot" jsonb,
	"status" "order_status" DEFAULT 'confirmed' NOT NULL,
	"planned_ex_factory_date" date,
	"owner_user_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_currency_iso" CHECK (char_length("orders"."currency") = 3)
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tna_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"name" text NOT NULL,
	"planned_date" date NOT NULL,
	"actual_date" date,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"owner_role" "role_name",
	"owner_user_id" text,
	"status" "milestone_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tna_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tna_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"product_type" text NOT NULL,
	"milestones" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tna_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "btb_lcs" ADD CONSTRAINT "btb_lcs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "btb_lcs" ADD CONSTRAINT "btb_lcs_master_lc_id_lcs_id_fk" FOREIGN KEY ("master_lc_id") REFERENCES "public"."lcs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "btb_lcs" ADD CONSTRAINT "btb_lcs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lcs" ADD CONSTRAINT "lcs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lcs" ADD CONSTRAINT "lcs_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lcs" ADD CONSTRAINT "lcs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lcs" ADD CONSTRAINT "lcs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_breakdowns" ADD CONSTRAINT "order_breakdowns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_breakdowns" ADD CONSTRAINT "order_breakdowns_order_style_id_order_styles_id_fk" FOREIGN KEY ("order_style_id") REFERENCES "public"."order_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lcs" ADD CONSTRAINT "order_lcs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lcs" ADD CONSTRAINT "order_lcs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lcs" ADD CONSTRAINT "order_lcs_lc_id_lcs_id_fk" FOREIGN KEY ("lc_id") REFERENCES "public"."lcs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_styles" ADD CONSTRAINT "order_styles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_styles" ADD CONSTRAINT "order_styles_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tna_milestones" ADD CONSTRAINT "tna_milestones_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tna_milestones" ADD CONSTRAINT "tna_milestones_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tna_milestones" ADD CONSTRAINT "tna_milestones_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tna_templates" ADD CONSTRAINT "tna_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tna_templates" ADD CONSTRAINT "tna_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buyers_company_code_key" ON "buyers" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "buyers_company_name_idx" ON "buyers" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "btb_lcs_company_number_key" ON "btb_lcs" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "btb_lcs_master_idx" ON "btb_lcs" USING btree ("company_id","master_lc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lcs_company_number_key" ON "lcs" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "lcs_company_buyer_idx" ON "lcs" USING btree ("company_id","buyer_id");--> statement-breakpoint
CREATE INDEX "lcs_company_latest_shipment_idx" ON "lcs" USING btree ("company_id","latest_shipment_date");--> statement-breakpoint
CREATE INDEX "lcs_company_expiry_idx" ON "lcs" USING btree ("company_id","expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "order_breakdowns_style_revision_cell_key" ON "order_breakdowns" USING btree ("order_style_id","revision","color","size");--> statement-breakpoint
CREATE INDEX "order_breakdowns_company_style_idx" ON "order_breakdowns" USING btree ("company_id","order_style_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "order_files_order_document_key" ON "order_files" USING btree ("order_id","document_id");--> statement-breakpoint
CREATE INDEX "order_files_company_order_idx" ON "order_files" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lcs_order_lc_key" ON "order_lcs" USING btree ("order_id","lc_id");--> statement-breakpoint
CREATE INDEX "order_lcs_company_lc_idx" ON "order_lcs" USING btree ("company_id","lc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_revisions_order_revision_key" ON "order_revisions" USING btree ("order_id","revision");--> statement-breakpoint
CREATE INDEX "order_revisions_company_order_idx" ON "order_revisions" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_styles_order_code_key" ON "order_styles" USING btree ("order_id","style_code");--> statement-breakpoint
CREATE INDEX "order_styles_company_order_idx" ON "order_styles" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "orders_company_exfactory_idx" ON "orders" USING btree ("company_id","planned_ex_factory_date");--> statement-breakpoint
CREATE INDEX "orders_company_status_idx" ON "orders" USING btree ("company_id","status","planned_ex_factory_date");--> statement-breakpoint
CREATE INDEX "orders_company_buyer_idx" ON "orders" USING btree ("company_id","buyer_id");--> statement-breakpoint
CREATE INDEX "orders_company_owner_idx" ON "orders" USING btree ("company_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "orders_po_numbers_idx" ON "orders" USING gin ("po_numbers");--> statement-breakpoint
CREATE UNIQUE INDEX "tna_milestones_order_name_key" ON "tna_milestones" USING btree ("order_id","name");--> statement-breakpoint
CREATE INDEX "tna_milestones_company_planned_idx" ON "tna_milestones" USING btree ("company_id","planned_date");--> statement-breakpoint
CREATE INDEX "tna_milestones_company_status_idx" ON "tna_milestones" USING btree ("company_id","status","planned_date");--> statement-breakpoint
CREATE INDEX "tna_milestones_company_owner_idx" ON "tna_milestones" USING btree ("company_id","owner_user_id","planned_date");--> statement-breakpoint
CREATE INDEX "tna_milestones_order_idx" ON "tna_milestones" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tna_templates_company_name_key" ON "tna_templates" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "tna_templates_company_product_idx" ON "tna_templates" USING btree ("company_id","product_type","is_active");