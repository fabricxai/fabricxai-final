CREATE TYPE "public"."payable_status" AS ENUM('open', 'part_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('open', 'part_realized', 'realized', 'written_off');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_currency_iso" CHECK (char_length("invoices"."currency") = 3),
	CONSTRAINT "invoices_value_positive" CHECK ("invoices"."value" > 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_costs_actual" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_per_piece" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"pieces" integer NOT NULL,
	"basis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_costs_actual_currency_iso" CHECK (char_length("order_costs_actual"."currency") = 3),
	CONSTRAINT "order_costs_actual_pieces_positive" CHECK ("order_costs_actual"."pieces" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_costs_actual" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_profitability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"fob_price" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"quoted_margin_pct" numeric(7, 2) NOT NULL,
	"actual_margin_pct" numeric(7, 2) NOT NULL,
	"margin_basis" text NOT NULL,
	"variance" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_profitability_currency_iso" CHECK (char_length("order_profitability"."currency") = 3),
	CONSTRAINT "order_profitability_basis" CHECK ("order_profitability"."margin_basis" IN ('price', 'cost'))
);
--> statement-breakpoint
ALTER TABLE "order_profitability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_po_id" uuid,
	"grn_id" uuid,
	"reference" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"due_at" date NOT NULL,
	"paid_amount" numeric(14, 2),
	"paid_at" date,
	"status" "payable_status" DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payables_currency_iso" CHECK (char_length("payables"."currency") = 3),
	CONSTRAINT "payables_amount_positive" CHECK ("payables"."amount" > 0),
	CONSTRAINT "payables_has_parent" CHECK ("payables"."supplier_po_id" IS NOT NULL OR "payables"."grn_id" IS NOT NULL),
	CONSTRAINT "payables_paid_has_date" CHECK ("payables"."paid_amount" IS NULL OR "payables"."paid_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "payables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"submission_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"expected_at" date NOT NULL,
	"expected_basis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"realized_amount" numeric(14, 2),
	"realized_at" date,
	"shortfall" numeric(14, 2),
	"status" "receivable_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivables_currency_iso" CHECK (char_length("receivables"."currency") = 3),
	CONSTRAINT "receivables_amount_positive" CHECK ("receivables"."amount" > 0),
	CONSTRAINT "receivables_realized_has_date" CHECK ("receivables"."realized_amount" IS NULL OR "receivables"."realized_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "receivables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_costs_actual" ADD CONSTRAINT "order_costs_actual_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_costs_actual" ADD CONSTRAINT "order_costs_actual_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_profitability" ADD CONSTRAINT "order_profitability_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_profitability" ADD CONSTRAINT "order_profitability_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_company_number_key" ON "invoices" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "invoices_company_order_idx" ON "invoices" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "invoices_shipment_idx" ON "invoices" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_costs_actual_order_key" ON "order_costs_actual" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_costs_actual_company_idx" ON "order_costs_actual" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_profitability_order_key" ON "order_profitability" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_profitability_company_margin_idx" ON "order_profitability" USING btree ("company_id","actual_margin_pct");--> statement-breakpoint
CREATE UNIQUE INDEX "payables_company_reference_key" ON "payables" USING btree ("company_id","reference");--> statement-breakpoint
CREATE INDEX "payables_company_due_idx" ON "payables" USING btree ("company_id","status","due_at");--> statement-breakpoint
CREATE INDEX "payables_supplier_po_idx" ON "payables" USING btree ("supplier_po_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receivables_invoice_key" ON "receivables" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "receivables_company_expected_idx" ON "receivables" USING btree ("company_id","status","expected_at");--> statement-breakpoint
CREATE INDEX "receivables_submission_idx" ON "receivables" USING btree ("submission_id");