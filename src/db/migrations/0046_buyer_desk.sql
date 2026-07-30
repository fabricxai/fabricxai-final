CREATE TYPE "public"."agent_type" AS ENUM('buying_house', 'individual');--> statement-breakpoint
CREATE TYPE "public"."buyer_contact_role" AS ENUM('merchandiser', 'qa', 'sourcing', 'finance', 'other');--> statement-breakpoint
CREATE TYPE "public"."buyer_document_kind" AS ENUM('manual', 'agreement', 'coc', 'other');--> statement-breakpoint
CREATE TYPE "public"."buyer_status" AS ENUM('active', 'dormant', 'blacklisted');--> statement-breakpoint
CREATE TYPE "public"."lead_activity_kind" AS ENUM('call', 'email', 'meeting', 'note');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('fair', 'referral', 'buying_house', 'inbound', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'sampling_talk', 'negotiation', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."payment_term" AS ENUM('lc', 'tt', 'dp');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "agent_type" NOT NULL,
	"commission_pct" numeric(5, 2),
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_commission_range" CHECK ("agents"."commission_pct" IS NULL OR ("agents"."commission_pct" >= 0 AND "agents"."commission_pct" <= 100))
);
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "buyer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "buyer_contact_role" NOT NULL,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyer_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "buyer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" "buyer_document_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyer_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "buyer_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"category" text NOT NULL,
	"text" text NOT NULL,
	"source_document_id" uuid,
	"source_page" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyer_requirements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "buyer_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"valid_from" date NOT NULL,
	"payment" "payment_term" NOT NULL,
	"incoterm" text NOT NULL,
	"tolerance_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"aql_level" text NOT NULL,
	"minor_aql_level" text,
	"nominated_banks" text[] DEFAULT '{}'::text[] NOT NULL,
	"nominated_forwarders" text[] DEFAULT '{}'::text[] NOT NULL,
	"nominated_labs" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_terms_version_positive" CHECK ("buyer_terms"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "buyer_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" "lead_activity_kind" NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" date NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" "lead_source" NOT NULL,
	"company_name" text NOT NULL,
	"country" text,
	"website" text,
	"normalized_name" text,
	"normalized_domain" text,
	"agent_id" uuid,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"lost_reason" text,
	"converted_buyer_id" uuid,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_lost_needs_reason" CHECK ("leads"."stage" <> 'lost' OR "leads"."lost_reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "brands" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "normalized_domain" text;--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "status" "buyer_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_contacts" ADD CONSTRAINT "buyer_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_contacts" ADD CONSTRAINT "buyer_contacts_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_terms" ADD CONSTRAINT "buyer_terms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_terms" ADD CONSTRAINT "buyer_terms_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_terms" ADD CONSTRAINT "buyer_terms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_buyer_id_buyers_id_fk" FOREIGN KEY ("converted_buyer_id") REFERENCES "public"."buyers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_company_name_key" ON "agents" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_contacts_primary_key" ON "buyer_contacts" USING btree ("buyer_id") WHERE is_primary = true;--> statement-breakpoint
CREATE INDEX "buyer_contacts_company_buyer_idx" ON "buyer_contacts" USING btree ("company_id","buyer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_documents_key" ON "buyer_documents" USING btree ("buyer_id","document_id");--> statement-breakpoint
CREATE INDEX "buyer_documents_company_buyer_idx" ON "buyer_documents" USING btree ("company_id","buyer_id","kind");--> statement-breakpoint
CREATE INDEX "buyer_requirements_company_buyer_idx" ON "buyer_requirements" USING btree ("company_id","buyer_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_terms_buyer_version_key" ON "buyer_terms" USING btree ("buyer_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_terms_buyer_valid_from_key" ON "buyer_terms" USING btree ("buyer_id","valid_from");--> statement-breakpoint
CREATE INDEX "buyer_terms_company_buyer_idx" ON "buyer_terms" USING btree ("company_id","buyer_id","valid_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lead_activities_lead_occurred_idx" ON "lead_activities" USING btree ("lead_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lead_activities_company_occurred_idx" ON "lead_activities" USING btree ("company_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_company_stage_idx" ON "leads" USING btree ("company_id","stage","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_company_domain_idx" ON "leads" USING btree ("company_id","normalized_domain");--> statement-breakpoint
CREATE INDEX "leads_company_agent_idx" ON "leads" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_converted_buyer_key" ON "leads" USING btree ("converted_buyer_id") WHERE converted_buyer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "buyers_company_status_idx" ON "buyers" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "buyers_company_domain_idx" ON "buyers" USING btree ("company_id","normalized_domain");