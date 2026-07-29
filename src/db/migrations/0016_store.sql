CREATE TYPE "public"."inspection_status" AS ENUM('pending', 'passed', 'failed_partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('fabric', 'trim', 'accessory');--> statement-breakpoint
CREATE TYPE "public"."location_kind" AS ENUM('bonded', 'general', 'floor');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('open', 'partial', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."roll_status" AS ENUM('in_stock', 'issued', 'returned', 'adjusted_out');--> statement-breakpoint
CREATE TABLE "grn_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"grn_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(14, 2),
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grn_lines_qty_positive" CHECK ("grn_lines"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "grn_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"challan_no" text NOT NULL,
	"received_at" date NOT NULL,
	"supplier_po_id" uuid,
	"bonded" boolean DEFAULT false NOT NULL,
	"ud_id" uuid,
	"inspection_status" "inspection_status" DEFAULT 'pending' NOT NULL,
	"document_id" uuid,
	"offline_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grns_bonded_requires_ud" CHECK ("grns"."bonded" = false OR "grns"."ud_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "grns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "issue_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"roll_id" uuid,
	"qty" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_lines_qty_positive" CHECK ("issue_lines"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "issue_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requisition_id" uuid,
	"order_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"offline_key" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uom" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "location_kind" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"required_qty" numeric(12, 2) NOT NULL,
	"issued_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_lines_required_positive" CHECK ("requisition_lines"."required_qty" > 0),
	CONSTRAINT "requisition_lines_not_over_issued" CHECK ("requisition_lines"."issued_qty" <= "requisition_lines"."required_qty")
);
--> statement-breakpoint
ALTER TABLE "requisition_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "requisition_status" DEFAULT 'open' NOT NULL,
	"basis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requisitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"grn_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"roll_no" text NOT NULL,
	"lot" text,
	"dye_lot" text,
	"shade_group" text,
	"qty" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"location_id" uuid NOT NULL,
	"status" "roll_status" DEFAULT 'in_stock' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rolls_qty_positive" CHECK ("rolls"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "rolls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"roll_id" uuid,
	"qty_delta" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"reason_code" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_adjustments_delta_nonzero" CHECK ("stock_adjustments"."qty_delta" <> 0)
);
--> statement-breakpoint
ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_ud_id_uds_id_fk" FOREIGN KEY ("ud_id") REFERENCES "public"."uds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_lines" ADD CONSTRAINT "issue_lines_roll_id_rolls_id_fk" FOREIGN KEY ("roll_id") REFERENCES "public"."rolls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_grn_line_id_grn_lines_id_fk" FOREIGN KEY ("grn_line_id") REFERENCES "public"."grn_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_roll_id_rolls_id_fk" FOREIGN KEY ("roll_id") REFERENCES "public"."rolls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grn_lines_company_grn_idx" ON "grn_lines" USING btree ("company_id","grn_id");--> statement-breakpoint
CREATE INDEX "grn_lines_company_item_idx" ON "grn_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grns_company_challan_key" ON "grns" USING btree ("company_id","challan_no");--> statement-breakpoint
CREATE UNIQUE INDEX "grns_offline_key" ON "grns" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "grns_company_received_idx" ON "grns" USING btree ("company_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "grns_company_inspection_idx" ON "grns" USING btree ("company_id","inspection_status");--> statement-breakpoint
CREATE INDEX "issue_lines_company_issue_idx" ON "issue_lines" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE INDEX "issue_lines_company_item_idx" ON "issue_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE INDEX "issue_lines_roll_idx" ON "issue_lines" USING btree ("roll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_offline_key" ON "issues" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "issues_company_order_idx" ON "issues" USING btree ("company_id","order_id","issued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "issues_company_issued_idx" ON "issues" USING btree ("company_id","issued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "items_company_code_key" ON "items" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "items_company_kind_idx" ON "items" USING btree ("company_id","kind","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_company_code_key" ON "locations" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "locations_company_kind_idx" ON "locations" USING btree ("company_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "requisition_lines_req_item_key" ON "requisition_lines" USING btree ("requisition_id","item_id");--> statement-breakpoint
CREATE INDEX "requisition_lines_company_item_idx" ON "requisition_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE INDEX "requisitions_company_order_idx" ON "requisitions" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "requisitions_company_status_idx" ON "requisitions" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "rolls_company_roll_no_key" ON "rolls" USING btree ("company_id","roll_no");--> statement-breakpoint
CREATE INDEX "rolls_company_item_status_idx" ON "rolls" USING btree ("company_id","item_id","status");--> statement-breakpoint
CREATE INDEX "rolls_company_location_idx" ON "rolls" USING btree ("company_id","location_id","status");--> statement-breakpoint
CREATE INDEX "rolls_company_shade_idx" ON "rolls" USING btree ("company_id","item_id","shade_group");--> statement-breakpoint
CREATE INDEX "stock_adjustments_company_item_idx" ON "stock_adjustments" USING btree ("company_id","item_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_adjustments_company_reason_idx" ON "stock_adjustments" USING btree ("company_id","reason_code");