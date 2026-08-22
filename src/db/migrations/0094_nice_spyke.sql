CREATE TYPE "public"."ship_date_kind" AS ENUM('contract', 'reship', 'proposed');--> statement-breakpoint
CREATE TABLE "order_ship_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"ship_date" date NOT NULL,
	"kind" "ship_date_kind" NOT NULL,
	"agreed_with" text,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_ship_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_ship_dates" ADD CONSTRAINT "order_ship_dates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ship_dates" ADD CONSTRAINT "order_ship_dates_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ship_dates" ADD CONSTRAINT "order_ship_dates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_ship_dates_company_order_idx" ON "order_ship_dates" USING btree ("company_id","order_id","created_at");