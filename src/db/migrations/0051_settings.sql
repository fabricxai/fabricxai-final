CREATE TABLE "company_profiles" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"address_lines" text[] DEFAULT '{}'::text[] NOT NULL,
	"country" text DEFAULT 'BD' NOT NULL,
	"bin_number" text,
	"tin_number" text,
	"bond_licence_no" text,
	"timezone" text DEFAULT 'Asia/Dhaka' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"local_currency" text DEFAULT 'BDT' NOT NULL,
	"logo_document_id" uuid,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_profiles_base_currency_iso" CHECK (char_length("company_profiles"."base_currency") = 3),
	CONSTRAINT "company_profiles_local_currency_iso" CHECK (char_length("company_profiles"."local_currency") = 3)
);
--> statement-breakpoint
ALTER TABLE "company_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "module_toggles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "module_toggles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "policy_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_toggles" ADD CONSTRAINT "module_toggles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_toggles" ADD CONSTRAINT "module_toggles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_settings" ADD CONSTRAINT "policy_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_settings" ADD CONSTRAINT "policy_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "module_toggles_company_module_key" ON "module_toggles" USING btree ("company_id","module_id");--> statement-breakpoint
CREATE INDEX "module_toggles_company_idx" ON "module_toggles" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_settings_company_module_key" ON "policy_settings" USING btree ("company_id","module_id");--> statement-breakpoint
CREATE INDEX "policy_settings_company_idx" ON "policy_settings" USING btree ("company_id");