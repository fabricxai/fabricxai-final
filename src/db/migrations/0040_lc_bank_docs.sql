CREATE TYPE "public"."bank_charge_kind" AS ENUM('lc_opening', 'amendment', 'negotiation', 'discrepancy', 'courier', 'swift', 'acceptance', 'other');--> statement-breakpoint
CREATE TYPE "public"."bank_status" AS ENUM('preparing', 'submitted', 'accepted', 'discrepant', 'realized');--> statement-breakpoint
CREATE TABLE "bank_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lc_id" uuid,
	"submission_id" uuid,
	"kind" "bank_charge_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"charged_on" date NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_charges_currency_iso" CHECK (char_length("bank_charges"."currency") = 3),
	CONSTRAINT "bank_charges_amount_positive" CHECK ("bank_charges"."amount" > 0),
	CONSTRAINT "bank_charges_has_parent" CHECK ("bank_charges"."lc_id" IS NOT NULL OR "bank_charges"."submission_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "bank_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "doc_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lc_id" uuid NOT NULL,
	"shipment_id" uuid,
	"docs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invoiced_amount" numeric(14, 2),
	"currency" text NOT NULL,
	"bank_status" "bank_status" DEFAULT 'preparing' NOT NULL,
	"submitted_at" date,
	"discrepancy_notes" text,
	"discrepant_since" date,
	"realized_amount" numeric(14, 2),
	"realized_at" date,
	"shortfall_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_submissions_currency_iso" CHECK (char_length("doc_submissions"."currency") = 3),
	CONSTRAINT "doc_submissions_submitted_has_date" CHECK ("doc_submissions"."bank_status" IN ('preparing') OR "doc_submissions"."submitted_at" IS NOT NULL),
	CONSTRAINT "doc_submissions_discrepant_has_notes" CHECK ("doc_submissions"."bank_status" <> 'discrepant'
        OR ("doc_submissions"."discrepancy_notes" IS NOT NULL AND "doc_submissions"."discrepant_since" IS NOT NULL)),
	CONSTRAINT "doc_submissions_realized_has_amount" CHECK ("doc_submissions"."bank_status" <> 'realized'
        OR ("doc_submissions"."realized_amount" IS NOT NULL AND "doc_submissions"."realized_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "doc_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lc_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lc_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tightened" boolean DEFAULT false NOT NULL,
	"conflicts_after" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" date NOT NULL,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lc_amendments_number_positive" CHECK ("lc_amendments"."number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "lc_amendments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_charges" ADD CONSTRAINT "bank_charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_charges" ADD CONSTRAINT "bank_charges_lc_id_lcs_id_fk" FOREIGN KEY ("lc_id") REFERENCES "public"."lcs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_charges" ADD CONSTRAINT "bank_charges_submission_id_doc_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."doc_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_charges" ADD CONSTRAINT "bank_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_submissions" ADD CONSTRAINT "doc_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_submissions" ADD CONSTRAINT "doc_submissions_lc_id_lcs_id_fk" FOREIGN KEY ("lc_id") REFERENCES "public"."lcs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_submissions" ADD CONSTRAINT "doc_submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc_amendments" ADD CONSTRAINT "lc_amendments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc_amendments" ADD CONSTRAINT "lc_amendments_lc_id_lcs_id_fk" FOREIGN KEY ("lc_id") REFERENCES "public"."lcs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc_amendments" ADD CONSTRAINT "lc_amendments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lc_amendments" ADD CONSTRAINT "lc_amendments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_charges_company_lc_idx" ON "bank_charges" USING btree ("company_id","lc_id");--> statement-breakpoint
CREATE INDEX "bank_charges_submission_idx" ON "bank_charges" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "bank_charges_company_charged_idx" ON "bank_charges" USING btree ("company_id","charged_on");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_submissions_shipment_key" ON "doc_submissions" USING btree ("shipment_id") WHERE shipment_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "doc_submissions_company_lc_idx" ON "doc_submissions" USING btree ("company_id","lc_id");--> statement-breakpoint
CREATE INDEX "doc_submissions_company_status_idx" ON "doc_submissions" USING btree ("company_id","bank_status");--> statement-breakpoint
CREATE INDEX "doc_submissions_discrepant_idx" ON "doc_submissions" USING btree ("company_id","discrepant_since");--> statement-breakpoint
CREATE INDEX "doc_submissions_company_realized_idx" ON "doc_submissions" USING btree ("company_id","realized_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lc_amendments_lc_number_key" ON "lc_amendments" USING btree ("lc_id","number");--> statement-breakpoint
CREATE INDEX "lc_amendments_company_lc_idx" ON "lc_amendments" USING btree ("company_id","lc_id","number");