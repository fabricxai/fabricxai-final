CREATE TYPE "public"."po_line_status" AS ENUM('open', 'received_partial', 'received', 'short_closed');--> statement-breakpoint
CREATE TYPE "public"."pr_status" AS ENUM('open', 'quoted', 'ordered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."supplier_origin" AS ENUM('local', 'import');--> statement-breakpoint
CREATE TYPE "public"."supplier_po_status" AS ENUM('issued', 'confirmed', 'in_production', 'shipped', 'received_partial', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."supplier_type" AS ENUM('fabric_mill', 'trims', 'embellishment', 'subcontract');--> statement-breakpoint
CREATE TABLE "purchase_requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"purchase_requisition_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pr_lines_qty_positive" CHECK ("purchase_requisition_lines"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid,
	"requisition_id" uuid,
	"pr_no" text NOT NULL,
	"needed_by" date NOT NULL,
	"status" "pr_status" DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_po_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_po_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"received_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "po_line_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_po_lines_qty_positive" CHECK ("supplier_po_lines"."qty" > 0),
	CONSTRAINT "supplier_po_lines_received_nonneg" CHECK ("supplier_po_lines"."received_qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_po_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_pos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_requisition_id" uuid,
	"supplier_quote_id" uuid,
	"po_number" text NOT NULL,
	"currency" text NOT NULL,
	"total_value" numeric(14, 2) NOT NULL,
	"btb_lc_id" uuid,
	"document_id" uuid,
	"expected_delivery_date" date,
	"status" "supplier_po_status" DEFAULT 'issued' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_pos_currency_iso" CHECK (char_length("supplier_pos"."currency") = 3),
	CONSTRAINT "supplier_pos_total_nonneg" CHECK ("supplier_pos"."total_value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_pos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_quote_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"lead_time_days" integer NOT NULL,
	"moq" numeric(12, 2) DEFAULT '0' NOT NULL,
	"freight" numeric(14, 2) DEFAULT '0' NOT NULL,
	"duty_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_quote_lines_price_positive" CHECK ("supplier_quote_lines"."unit_price" > 0),
	CONSTRAINT "supplier_quote_lines_lead_time_nonneg" CHECK ("supplier_quote_lines"."lead_time_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_quote_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"purchase_requisition_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"quoted_on" date NOT NULL,
	"valid_until" date,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_quotes_currency_iso" CHECK (char_length("supplier_quotes"."currency") = 3)
);
--> statement-breakpoint
ALTER TABLE "supplier_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"period" date NOT NULL,
	"on_time_pct" numeric(5, 2),
	"quality_reject_pct" numeric(5, 2),
	"price_index" numeric(7, 2),
	"responsiveness_pct" numeric(5, 2),
	"observations" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "supplier_type" NOT NULL,
	"origin" "supplier_origin" NOT NULL,
	"payment_terms" text,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_currency_iso" CHECK (char_length("suppliers"."default_currency") = 3)
);
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_purchase_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("purchase_requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_po_lines" ADD CONSTRAINT "supplier_po_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_po_lines" ADD CONSTRAINT "supplier_po_lines_supplier_po_id_supplier_pos_id_fk" FOREIGN KEY ("supplier_po_id") REFERENCES "public"."supplier_pos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_po_lines" ADD CONSTRAINT "supplier_po_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD CONSTRAINT "supplier_pos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD CONSTRAINT "supplier_pos_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD CONSTRAINT "supplier_pos_purchase_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("purchase_requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD CONSTRAINT "supplier_pos_supplier_quote_id_supplier_quotes_id_fk" FOREIGN KEY ("supplier_quote_id") REFERENCES "public"."supplier_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD CONSTRAINT "supplier_pos_btb_lc_id_btb_lcs_id_fk" FOREIGN KEY ("btb_lc_id") REFERENCES "public"."btb_lcs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD CONSTRAINT "supplier_pos_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pos" ADD CONSTRAINT "supplier_pos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quote_lines" ADD CONSTRAINT "supplier_quote_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quote_lines" ADD CONSTRAINT "supplier_quote_lines_supplier_quote_id_supplier_quotes_id_fk" FOREIGN KEY ("supplier_quote_id") REFERENCES "public"."supplier_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quote_lines" ADD CONSTRAINT "supplier_quote_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_purchase_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("purchase_requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_scores" ADD CONSTRAINT "supplier_scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_scores" ADD CONSTRAINT "supplier_scores_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_lines_company_pr_idx" ON "purchase_requisition_lines" USING btree ("company_id","purchase_requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requisitions_company_no_key" ON "purchase_requisitions" USING btree ("company_id","pr_no");--> statement-breakpoint
CREATE INDEX "purchase_requisitions_company_status_idx" ON "purchase_requisitions" USING btree ("company_id","status","needed_by");--> statement-breakpoint
CREATE INDEX "purchase_requisitions_company_order_idx" ON "purchase_requisitions" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "supplier_po_lines_company_po_idx" ON "supplier_po_lines" USING btree ("company_id","supplier_po_id");--> statement-breakpoint
CREATE INDEX "supplier_po_lines_company_item_idx" ON "supplier_po_lines" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE INDEX "supplier_po_lines_open_idx" ON "supplier_po_lines" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_pos_company_number_key" ON "supplier_pos" USING btree ("company_id","po_number");--> statement-breakpoint
CREATE INDEX "supplier_pos_company_supplier_idx" ON "supplier_pos" USING btree ("company_id","supplier_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "supplier_pos_company_status_idx" ON "supplier_pos" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "supplier_pos_company_expected_idx" ON "supplier_pos" USING btree ("company_id","expected_delivery_date");--> statement-breakpoint
CREATE INDEX "supplier_pos_btb_idx" ON "supplier_pos" USING btree ("btb_lc_id");--> statement-breakpoint
CREATE INDEX "supplier_quote_lines_company_quote_idx" ON "supplier_quote_lines" USING btree ("company_id","supplier_quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_quotes_pr_supplier_key" ON "supplier_quotes" USING btree ("purchase_requisition_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_quotes_company_supplier_idx" ON "supplier_quotes" USING btree ("company_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_scores_supplier_period_key" ON "supplier_scores" USING btree ("supplier_id","period");--> statement-breakpoint
CREATE INDEX "supplier_scores_company_period_idx" ON "supplier_scores" USING btree ("company_id","period" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_company_code_key" ON "suppliers" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "suppliers_company_type_idx" ON "suppliers" USING btree ("company_id","type","is_active");