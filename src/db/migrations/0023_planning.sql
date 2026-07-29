CREATE TYPE "public"."allocation_status" AS ENUM('planned', 'active', 'done');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('draft', 'applied', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."smv_source" AS ENUM('ie_study', 'estimate');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"planned_daily" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "allocation_status" DEFAULT 'planned' NOT NULL,
	"accepted_violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_range_ordered" CHECK ("allocations"."end_date" >= "allocations"."start_date")
);
--> statement-breakpoint
ALTER TABLE "allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "factory_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factory_units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"factory_unit_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "floors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learning_curves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_type" text NOT NULL,
	"day_index" integer NOT NULL,
	"efficiency_pct" numeric(6, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_curves_day_positive" CHECK ("learning_curves"."day_index" >= 1),
	CONSTRAINT "learning_curves_efficiency_range" CHECK ("learning_curves"."efficiency_pct" > 0 AND "learning_curves"."efficiency_pct" <= 200)
);
--> statement-breakpoint
ALTER TABLE "learning_curves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "line_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"calendar_date" date NOT NULL,
	"shift_minutes" integer DEFAULT 480 NOT NULL,
	"planned_downtime_minutes" integer DEFAULT 0 NOT NULL,
	"manpower" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_calendars_downtime_within_shift" CHECK ("line_calendars"."planned_downtime_minutes" >= 0 AND "line_calendars"."planned_downtime_minutes" < "line_calendars"."shift_minutes")
);
--> statement-breakpoint
ALTER TABLE "line_calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draft_allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "scenario_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "smv_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"style_code" text NOT NULL,
	"smv" numeric(8, 2) NOT NULL,
	"source" "smv_source" DEFAULT 'estimate' NOT NULL,
	"measured_at" date,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smv_records_positive" CHECK ("smv_records"."smv" > 0)
);
--> statement-breakpoint
ALTER TABLE "smv_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lines" ADD COLUMN "machines_count" integer;--> statement-breakpoint
ALTER TABLE "lines" ADD COLUMN "floor_id" uuid;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_units" ADD CONSTRAINT "factory_units_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_factory_unit_id_factory_units_id_fk" FOREIGN KEY ("factory_unit_id") REFERENCES "public"."factory_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_curves" ADD CONSTRAINT "learning_curves_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_calendars" ADD CONSTRAINT "line_calendars_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_calendars" ADD CONSTRAINT "line_calendars_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smv_records" ADD CONSTRAINT "smv_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smv_records" ADD CONSTRAINT "smv_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_company_line_dates_idx" ON "allocations" USING btree ("company_id","line_id","start_date");--> statement-breakpoint
CREATE INDEX "allocations_company_order_idx" ON "allocations" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "allocations_company_status_idx" ON "allocations" USING btree ("company_id","status","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "factory_units_company_code_key" ON "factory_units" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "floors_company_code_key" ON "floors" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "floors_company_unit_idx" ON "floors" USING btree ("company_id","factory_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_curves_type_day_key" ON "learning_curves" USING btree ("company_id","product_type","day_index");--> statement-breakpoint
CREATE UNIQUE INDEX "line_calendars_line_date_key" ON "line_calendars" USING btree ("line_id","calendar_date");--> statement-breakpoint
CREATE INDEX "line_calendars_company_date_idx" ON "line_calendars" USING btree ("company_id","calendar_date");--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_company_name_key" ON "scenarios" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "scenarios_company_status_idx" ON "scenarios" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "smv_records_company_style_idx" ON "smv_records" USING btree ("company_id","style_code","measured_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lines_company_floor_idx" ON "lines" USING btree ("company_id","floor_id");