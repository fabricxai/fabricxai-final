CREATE TABLE "offline_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"offline_key" text NOT NULL,
	"module_id" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"result_row_id" text,
	"error" jsonb,
	"client_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offline_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "offline_keys" ADD CONSTRAINT "offline_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offline_keys_company_key" ON "offline_keys" USING btree ("company_id","offline_key");--> statement-breakpoint
CREATE INDEX "offline_keys_company_created_idx" ON "offline_keys" USING btree ("company_id","created_at" DESC NULLS LAST);