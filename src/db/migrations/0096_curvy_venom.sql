CREATE TYPE "public"."colour_approval_status" AS ENUM('pending', 'sent', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "order_colour_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"color" text NOT NULL,
	"stage" text NOT NULL,
	"status" "colour_approval_status" DEFAULT 'pending' NOT NULL,
	"decided_on" date,
	"note" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_colour_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"drop_no" integer NOT NULL,
	"qty" integer NOT NULL,
	"ship_date" date NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_drops_qty_positive" CHECK ("order_drops"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_drops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_fabric_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"leg" text NOT NULL,
	"plan_date" date,
	"actual_date" date,
	"note" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_fabric_legs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "order_breakdowns_style_revision_cell_key";--> statement-breakpoint
ALTER TABLE "order_breakdowns" ADD COLUMN "variant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_colour_approvals" ADD CONSTRAINT "order_colour_approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_colour_approvals" ADD CONSTRAINT "order_colour_approvals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_colour_approvals" ADD CONSTRAINT "order_colour_approvals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drops" ADD CONSTRAINT "order_drops_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drops" ADD CONSTRAINT "order_drops_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drops" ADD CONSTRAINT "order_drops_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fabric_legs" ADD CONSTRAINT "order_fabric_legs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fabric_legs" ADD CONSTRAINT "order_fabric_legs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fabric_legs" ADD CONSTRAINT "order_fabric_legs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_colour_approvals_cell_key" ON "order_colour_approvals" USING btree ("order_id","color","stage");--> statement-breakpoint
CREATE INDEX "order_colour_approvals_company_order_idx" ON "order_colour_approvals" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_drops_order_no_key" ON "order_drops" USING btree ("order_id","drop_no");--> statement-breakpoint
CREATE INDEX "order_drops_company_order_idx" ON "order_drops" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_fabric_legs_order_leg_key" ON "order_fabric_legs" USING btree ("order_id","leg");--> statement-breakpoint
CREATE INDEX "order_fabric_legs_company_order_idx" ON "order_fabric_legs" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_breakdowns_style_revision_cell_key" ON "order_breakdowns" USING btree ("order_style_id","revision","color","size","variant");