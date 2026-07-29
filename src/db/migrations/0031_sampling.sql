CREATE TYPE "public"."sample_request_status" AS ENUM('requested', 'in_work', 'dispatched', 'feedback', 'approved', 'rejected', 'closed');--> statement-breakpoint
CREATE TYPE "public"."sample_stage" AS ENUM('pattern', 'cutting', 'sewing', 'finishing', 'qc', 'dispatched');--> statement-breakpoint
CREATE TYPE "public"."sample_type" AS ENUM('proto', 'fit', 'sms', 'pp', 'top', 'shipment');--> statement-breakpoint
CREATE TYPE "public"."sample_verdict" AS ENUM('approved', 'approved_with_comments', 'rejected');--> statement-breakpoint
CREATE TABLE "sample_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sample_request_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sample_costs_currency_iso" CHECK (char_length("sample_costs"."currency") = 3),
	CONSTRAINT "sample_costs_amount_positive" CHECK ("sample_costs"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "sample_costs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sample_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sample_request_id" uuid NOT NULL,
	"courier" text NOT NULL,
	"awb" text NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sample_dispatches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sample_feedback_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sample_request_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"verdict" "sample_verdict" NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recorded_on" date NOT NULL,
	"document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sample_feedback_rounds_round_positive" CHECK ("sample_feedback_rounds"."round" >= 1)
);
--> statement-breakpoint
ALTER TABLE "sample_feedback_rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sample_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sample_request_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sample_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sample_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rfq_id" uuid,
	"order_id" uuid,
	"type" "sample_type" NOT NULL,
	"style_code" text NOT NULL,
	"request_no" text NOT NULL,
	"due_date" date,
	"status" "sample_request_status" DEFAULT 'requested' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sample_requests_rfq_xor_order" CHECK (("sample_requests"."rfq_id" IS NULL) <> ("sample_requests"."order_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "sample_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sample_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sample_request_id" uuid NOT NULL,
	"stage" "sample_stage" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"offline_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sample_stage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sample_costs" ADD CONSTRAINT "sample_costs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_costs" ADD CONSTRAINT "sample_costs_sample_request_id_sample_requests_id_fk" FOREIGN KEY ("sample_request_id") REFERENCES "public"."sample_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_costs" ADD CONSTRAINT "sample_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_dispatches" ADD CONSTRAINT "sample_dispatches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_dispatches" ADD CONSTRAINT "sample_dispatches_sample_request_id_sample_requests_id_fk" FOREIGN KEY ("sample_request_id") REFERENCES "public"."sample_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_dispatches" ADD CONSTRAINT "sample_dispatches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_rounds" ADD CONSTRAINT "sample_feedback_rounds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_rounds" ADD CONSTRAINT "sample_feedback_rounds_sample_request_id_sample_requests_id_fk" FOREIGN KEY ("sample_request_id") REFERENCES "public"."sample_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_rounds" ADD CONSTRAINT "sample_feedback_rounds_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_rounds" ADD CONSTRAINT "sample_feedback_rounds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_photos" ADD CONSTRAINT "sample_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_photos" ADD CONSTRAINT "sample_photos_sample_request_id_sample_requests_id_fk" FOREIGN KEY ("sample_request_id") REFERENCES "public"."sample_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_photos" ADD CONSTRAINT "sample_photos_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_photos" ADD CONSTRAINT "sample_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_requests" ADD CONSTRAINT "sample_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_requests" ADD CONSTRAINT "sample_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_requests" ADD CONSTRAINT "sample_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_stage_events" ADD CONSTRAINT "sample_stage_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_stage_events" ADD CONSTRAINT "sample_stage_events_sample_request_id_sample_requests_id_fk" FOREIGN KEY ("sample_request_id") REFERENCES "public"."sample_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_stage_events" ADD CONSTRAINT "sample_stage_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sample_costs_company_request_idx" ON "sample_costs" USING btree ("company_id","sample_request_id");--> statement-breakpoint
CREATE INDEX "sample_dispatches_company_request_idx" ON "sample_dispatches" USING btree ("company_id","sample_request_id");--> statement-breakpoint
CREATE INDEX "sample_dispatches_company_awb_idx" ON "sample_dispatches" USING btree ("company_id","awb");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_feedback_rounds_request_round_key" ON "sample_feedback_rounds" USING btree ("sample_request_id","round");--> statement-breakpoint
CREATE INDEX "sample_feedback_rounds_company_request_idx" ON "sample_feedback_rounds" USING btree ("company_id","sample_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_photos_request_document_key" ON "sample_photos" USING btree ("sample_request_id","document_id");--> statement-breakpoint
CREATE INDEX "sample_photos_company_request_idx" ON "sample_photos" USING btree ("company_id","sample_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_requests_company_no_key" ON "sample_requests" USING btree ("company_id","request_no");--> statement-breakpoint
CREATE INDEX "sample_requests_gate_idx" ON "sample_requests" USING btree ("company_id","order_id","style_code","type");--> statement-breakpoint
CREATE INDEX "sample_requests_company_due_idx" ON "sample_requests" USING btree ("company_id","due_date");--> statement-breakpoint
CREATE INDEX "sample_requests_company_status_idx" ON "sample_requests" USING btree ("company_id","status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_stage_events_request_stage_key" ON "sample_stage_events" USING btree ("sample_request_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_stage_events_offline_key" ON "sample_stage_events" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sample_stage_events_company_request_idx" ON "sample_stage_events" USING btree ("company_id","sample_request_id");