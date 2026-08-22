CREATE TYPE "public"."order_input_state" AS ENUM('pending', 'booked', 'in_house', 'not_applicable');--> statement-breakpoint
CREATE TABLE "order_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"category" text NOT NULL,
	"state" "order_input_state" DEFAULT 'pending' NOT NULL,
	"plan_date" date,
	"actual_date" date,
	"note" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_inputs_actual_only_in_house" CHECK ("order_inputs"."actual_date" IS NULL OR "order_inputs"."state" = 'in_house')
);
--> statement-breakpoint
ALTER TABLE "order_inputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_inputs" ADD CONSTRAINT "order_inputs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_inputs" ADD CONSTRAINT "order_inputs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_inputs" ADD CONSTRAINT "order_inputs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_inputs_order_category_key" ON "order_inputs" USING btree ("order_id","category");--> statement-breakpoint
CREATE INDEX "order_inputs_company_order_idx" ON "order_inputs" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "order_inputs_company_state_idx" ON "order_inputs" USING btree ("company_id","state");