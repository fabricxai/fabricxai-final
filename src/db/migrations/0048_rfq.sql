CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."rfq_source" AS ENUM('manual', 'ai_extracted');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('open', 'clarifying', 'quoted', 'won', 'lost', 'cancelled');--> statement-breakpoint
CREATE TABLE "loss_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loss_reasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"cost_sheet_id" uuid,
	"fob_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fob_price" numeric(14, 4) NOT NULL,
	"currency" text NOT NULL,
	"cm_bdt_equiv" numeric(14, 2),
	"validity_date" date,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"document_id" uuid,
	"below_floor_approval" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_version_positive" CHECK ("quotes"."version" >= 1),
	CONSTRAINT "quotes_price_positive" CHECK ("quotes"."fob_price" > 0),
	CONSTRAINT "quotes_currency_iso" CHECK (char_length("quotes"."currency") = 3),
	CONSTRAINT "quotes_sent_has_date" CHECK ("quotes"."status" <> 'sent' OR "quotes"."sent_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rfq_clarifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"question" text NOT NULL,
	"asked_at" date NOT NULL,
	"answer" text,
	"answered_at" date,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_clarifications_answer_has_date" CHECK ("rfq_clarifications"."answer" IS NULL OR "rfq_clarifications"."answered_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "rfq_clarifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"product_type" text NOT NULL,
	"description" text,
	"style_code" text,
	"quantity" integer NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"size_ratio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_price" numeric(14, 4),
	"target_currency" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"deadline" date,
	"requested_ship_date" date,
	"status" "rfq_status" DEFAULT 'open' NOT NULL,
	"source" "rfq_source" DEFAULT 'manual' NOT NULL,
	"loss_reason_code" text,
	"owner_user_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfqs_quantity_positive" CHECK ("rfqs"."quantity" > 0),
	CONSTRAINT "rfqs_currency_iso" CHECK (char_length("rfqs"."currency") = 3),
	CONSTRAINT "rfqs_lost_needs_reason" CHECK ("rfqs"."status" <> 'lost' OR "rfqs"."loss_reason_code" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "rfqs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loss_reasons" ADD CONSTRAINT "loss_reasons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_cost_sheet_id_cost_sheets_id_fk" FOREIGN KEY ("cost_sheet_id") REFERENCES "public"."cost_sheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_clarifications" ADD CONSTRAINT "rfq_clarifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_clarifications" ADD CONSTRAINT "rfq_clarifications_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_clarifications" ADD CONSTRAINT "rfq_clarifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loss_reasons_company_code_key" ON "loss_reasons" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_rfq_version_key" ON "quotes" USING btree ("rfq_id","version");--> statement-breakpoint
CREATE INDEX "quotes_company_rfq_idx" ON "quotes" USING btree ("company_id","rfq_id","version");--> statement-breakpoint
CREATE INDEX "quotes_company_status_idx" ON "quotes" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "rfq_clarifications_company_asked_idx" ON "rfq_clarifications" USING btree ("company_id","answered_at","asked_at");--> statement-breakpoint
CREATE INDEX "rfq_clarifications_rfq_idx" ON "rfq_clarifications" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "rfqs_company_status_idx" ON "rfqs" USING btree ("company_id","status","deadline");--> statement-breakpoint
CREATE INDEX "rfqs_company_buyer_idx" ON "rfqs" USING btree ("company_id","buyer_id");--> statement-breakpoint
CREATE INDEX "rfqs_company_deadline_idx" ON "rfqs" USING btree ("company_id","deadline");--> statement-breakpoint
CREATE INDEX "rfqs_company_owner_idx" ON "rfqs" USING btree ("company_id","owner_user_id","status");