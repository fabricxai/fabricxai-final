CREATE TYPE "public"."freight_mode" AS ENUM('sea', 'air');--> statement-breakpoint
CREATE TYPE "public"."packing_list_status" AS ENUM('draft', 'approved', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."port_status" AS ENUM('planned', 'ex_factory', 'at_port', 'on_board', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."shipment_doc_status" AS ENUM('pending', 'ready', 'submitted');--> statement-breakpoint
CREATE TABLE "cartons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"carton_no" text NOT NULL,
	"contents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_qty" integer NOT NULL,
	"gross_kg" numeric(10, 2),
	"net_kg" numeric(10, 2),
	"length_cm" numeric(8, 2),
	"width_cm" numeric(8, 2),
	"height_cm" numeric(8, 2),
	"cbm" numeric(12, 6),
	"offline_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cartons_total_positive" CHECK ("cartons"."total_qty" > 0),
	CONSTRAINT "cartons_net_within_gross" CHECK ("cartons"."net_kg" IS NULL OR "cartons"."gross_kg" IS NULL OR "cartons"."net_kg" <= "cartons"."gross_kg")
);
--> statement-breakpoint
ALTER TABLE "cartons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finishing_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_style_id" uuid,
	"output_date" date NOT NULL,
	"cells" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_qty" integer DEFAULT 0 NOT NULL,
	"offline_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finishing_outputs_total_nonneg" CHECK ("finishing_outputs"."total_qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "finishing_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "packing_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"version" integer NOT NULL,
	"generated" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mismatches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cartons" integer DEFAULT 0 NOT NULL,
	"total_qty" integer DEFAULT 0 NOT NULL,
	"status" "packing_list_status" DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packing_lists_version_positive" CHECK ("packing_lists"."version" >= 1),
	CONSTRAINT "packing_lists_approved_has_signature" CHECK ("packing_lists"."status" <> 'approved' OR ("packing_lists"."approved_by" IS NOT NULL AND "packing_lists"."approved_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "packing_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shipment_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"document_id" uuid,
	"status" "shipment_doc_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_docs_ready_has_document" CHECK ("shipment_docs"."status" = 'pending' OR "shipment_docs"."document_id" IS NOT NULL),
	CONSTRAINT "shipment_docs_submitted_has_date" CHECK ("shipment_docs"."status" <> 'submitted' OR "shipment_docs"."submitted_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "shipment_docs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"lc_id" uuid,
	"partial_no" integer DEFAULT 1 NOT NULL,
	"planned_ex_factory" date NOT NULL,
	"actual_ex_factory" date,
	"forwarder" text,
	"booking_ref" text,
	"exp_number" text,
	"bl_awb" text,
	"mode" "freight_mode" DEFAULT 'sea' NOT NULL,
	"port_status" "port_status" DEFAULT 'planned' NOT NULL,
	"tolerance_override" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_partial_positive" CHECK ("shipments"."partial_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cartons" ADD CONSTRAINT "cartons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartons" ADD CONSTRAINT "cartons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartons" ADD CONSTRAINT "cartons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finishing_outputs" ADD CONSTRAINT "finishing_outputs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finishing_outputs" ADD CONSTRAINT "finishing_outputs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finishing_outputs" ADD CONSTRAINT "finishing_outputs_order_style_id_order_styles_id_fk" FOREIGN KEY ("order_style_id") REFERENCES "public"."order_styles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finishing_outputs" ADD CONSTRAINT "finishing_outputs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_docs" ADD CONSTRAINT "shipment_docs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_docs" ADD CONSTRAINT "shipment_docs_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_docs" ADD CONSTRAINT "shipment_docs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_lc_id_lcs_id_fk" FOREIGN KEY ("lc_id") REFERENCES "public"."lcs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cartons_company_no_key" ON "cartons" USING btree ("company_id","carton_no");--> statement-breakpoint
CREATE UNIQUE INDEX "cartons_offline_key" ON "cartons" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cartons_company_order_idx" ON "cartons" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "cartons_shipment_idx" ON "cartons" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finishing_outputs_order_style_date_key" ON "finishing_outputs" USING btree ("order_id","order_style_id","output_date");--> statement-breakpoint
CREATE UNIQUE INDEX "finishing_outputs_offline_key" ON "finishing_outputs" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "finishing_outputs_company_order_idx" ON "finishing_outputs" USING btree ("company_id","order_id","output_date");--> statement-breakpoint
CREATE UNIQUE INDEX "packing_lists_order_version_key" ON "packing_lists" USING btree ("order_id","version");--> statement-breakpoint
CREATE INDEX "packing_lists_company_order_idx" ON "packing_lists" USING btree ("company_id","order_id","version");--> statement-breakpoint
CREATE INDEX "packing_lists_company_status_idx" ON "packing_lists" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_docs_shipment_kind_key" ON "shipment_docs" USING btree ("shipment_id","kind");--> statement-breakpoint
CREATE INDEX "shipment_docs_company_shipment_idx" ON "shipment_docs" USING btree ("company_id","shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_docs_company_status_idx" ON "shipment_docs" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_order_partial_key" ON "shipments" USING btree ("order_id","partial_no");--> statement-breakpoint
CREATE INDEX "shipments_company_order_idx" ON "shipments" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "shipments_company_status_idx" ON "shipments" USING btree ("company_id","port_status","planned_ex_factory");--> statement-breakpoint
CREATE INDEX "shipments_lc_idx" ON "shipments" USING btree ("lc_id");--> statement-breakpoint
CREATE INDEX "shipments_company_planned_idx" ON "shipments" USING btree ("company_id","planned_ex_factory");