CREATE TYPE "public"."downtime_reason" AS ENUM('machine', 'feeding', 'absent', 'power', 'other');--> statement-breakpoint
CREATE TABLE "daily_line_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"plan_date" date NOT NULL,
	"target_per_hour" integer NOT NULL,
	"manpower_planned" integer NOT NULL,
	"smv" numeric(8, 2),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_line_plans_target_positive" CHECK ("daily_line_plans"."target_per_hour" > 0)
);
--> statement-breakpoint
ALTER TABLE "daily_line_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "downtimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"reason" "downtime_reason" NOT NULL,
	"note" text,
	"machine_id" uuid,
	"ticket_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downtimes_range_ordered" CHECK ("downtimes"."ended_at" IS NULL OR "downtimes"."ended_at" >= "downtimes"."started_at")
);
--> statement-breakpoint
ALTER TABLE "downtimes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "efficiency_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"for_date" date NOT NULL,
	"earned_minutes" numeric(12, 2) NOT NULL,
	"available_minutes" numeric(12, 2) NOT NULL,
	"efficiency_pct" numeric(6, 2) NOT NULL,
	"output_total" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "efficiency_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "endline_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"counted_on" date NOT NULL,
	"checked" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"defective" integer DEFAULT 0 NOT NULL,
	"defects" integer DEFAULT 0 NOT NULL,
	"rework" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "endline_counts_passed_within_checked" CHECK ("endline_counts"."passed" <= "endline_counts"."checked")
);
--> statement-breakpoint
ALTER TABLE "endline_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hourly_outputs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"order_id" uuid,
	"produced_on" date NOT NULL,
	"hour_slot" integer NOT NULL,
	"target" integer DEFAULT 0 NOT NULL,
	"actual" integer DEFAULT 0 NOT NULL,
	"offline_key" text,
	"entered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hourly_outputs_id_produced_on_pk" PRIMARY KEY("id","produced_on"),
	CONSTRAINT "hourly_outputs_hour_slot_range" CHECK ("hourly_outputs"."hour_slot" >= 0 AND "hourly_outputs"."hour_slot" <= 23),
	CONSTRAINT "hourly_outputs_actual_not_negative" CHECK ("hourly_outputs"."actual" >= 0)
) PARTITION BY RANGE ("produced_on");
--> statement-breakpoint
ALTER TABLE "hourly_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"capacity_manpower" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wip_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cut" integer DEFAULT 0 NOT NULL,
	"sewn" integer DEFAULT 0 NOT NULL,
	"finished" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wip_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_line_plans" ADD CONSTRAINT "daily_line_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_line_plans" ADD CONSTRAINT "daily_line_plans_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_line_plans" ADD CONSTRAINT "daily_line_plans_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_line_plans" ADD CONSTRAINT "daily_line_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtimes" ADD CONSTRAINT "downtimes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efficiency_daily" ADD CONSTRAINT "efficiency_daily_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efficiency_daily" ADD CONSTRAINT "efficiency_daily_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endline_counts" ADD CONSTRAINT "endline_counts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endline_counts" ADD CONSTRAINT "endline_counts_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_outputs" ADD CONSTRAINT "hourly_outputs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_outputs" ADD CONSTRAINT "hourly_outputs_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_outputs" ADD CONSTRAINT "hourly_outputs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_outputs" ADD CONSTRAINT "hourly_outputs_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wip_snapshots" ADD CONSTRAINT "wip_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wip_snapshots" ADD CONSTRAINT "wip_snapshots_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_line_plans_line_date_key" ON "daily_line_plans" USING btree ("line_id","plan_date");--> statement-breakpoint
CREATE INDEX "daily_line_plans_company_date_idx" ON "daily_line_plans" USING btree ("company_id","plan_date");--> statement-breakpoint
CREATE INDEX "downtimes_company_open_idx" ON "downtimes" USING btree ("company_id","line_id","started_at") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "downtimes_company_started_idx" ON "downtimes" USING btree ("company_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "efficiency_daily_line_date_key" ON "efficiency_daily" USING btree ("line_id","for_date");--> statement-breakpoint
CREATE INDEX "efficiency_daily_company_date_idx" ON "efficiency_daily" USING btree ("company_id","for_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "endline_counts_line_date_key" ON "endline_counts" USING btree ("line_id","counted_on");--> statement-breakpoint
CREATE INDEX "endline_counts_company_date_idx" ON "endline_counts" USING btree ("company_id","counted_on");--> statement-breakpoint
CREATE UNIQUE INDEX "hourly_outputs_line_date_hour_key" ON "hourly_outputs" USING btree ("line_id","produced_on","hour_slot");--> statement-breakpoint
CREATE INDEX "hourly_outputs_company_date_idx" ON "hourly_outputs" USING btree ("company_id","produced_on");--> statement-breakpoint
CREATE INDEX "hourly_outputs_order_date_idx" ON "hourly_outputs" USING btree ("company_id","order_id","produced_on");--> statement-breakpoint
CREATE UNIQUE INDEX "lines_company_code_key" ON "lines" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "lines_company_idx" ON "lines" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "wip_snapshots_company_order_idx" ON "wip_snapshots" USING btree ("company_id","order_id","taken_at" DESC NULLS LAST);