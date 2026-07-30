CREATE TYPE "public"."pm_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('line_down', 'high', 'normal');--> statement-breakpoint
CREATE TYPE "public"."ticket_source" AS ENUM('downtime_auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'claimed', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TABLE "downtime_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"for_month" date NOT NULL,
	"minutes" integer NOT NULL,
	"value_per_minute" numeric(14, 2) NOT NULL,
	"estimated_loss" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downtime_costs_minutes_nonneg" CHECK ("downtime_costs"."minutes" >= 0),
	CONSTRAINT "downtime_costs_currency_iso" CHECK (char_length("downtime_costs"."currency") = 3),
	CONSTRAINT "downtime_costs_rate_positive" CHECK ("downtime_costs"."value_per_minute" > 0)
);
--> statement-breakpoint
ALTER TABLE "downtime_costs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"machine_type" text NOT NULL,
	"brand" text,
	"model" text,
	"serial" text,
	"purchased_at" date,
	"line_id" uuid,
	"assignment_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pm_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"completed_on" date NOT NULL,
	"checked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pm_completions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pm_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"machine_type" text NOT NULL,
	"cadence" "pm_cadence" NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pm_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spare_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"min_level" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spare_parts_on_hand_nonneg" CHECK ("spare_parts"."on_hand" >= 0),
	CONSTRAINT "spare_parts_min_level_nonneg" CHECK ("spare_parts"."min_level" >= 0)
);
--> statement-breakpoint
ALTER TABLE "spare_parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"machine_id" uuid,
	"downtime_id" uuid,
	"line_id" uuid,
	"source" "ticket_source" NOT NULL,
	"priority" "ticket_priority" NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"parts_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_claimed_has_claimer" CHECK ("tickets"."status" <> 'claimed' OR "tickets"."claimed_by" IS NOT NULL),
	CONSTRAINT "tickets_resolved_has_time" CHECK ("tickets"."status" <> 'resolved' OR "tickets"."resolved_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "downtime_costs" ADD CONSTRAINT "downtime_costs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_costs" ADD CONSTRAINT "downtime_costs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_completions" ADD CONSTRAINT "pm_completions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_completions" ADD CONSTRAINT "pm_completions_schedule_id_pm_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."pm_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_completions" ADD CONSTRAINT "pm_completions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_completions" ADD CONSTRAINT "pm_completions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedules" ADD CONSTRAINT "pm_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "downtime_costs_machine_month_key" ON "downtime_costs" USING btree ("machine_id","for_month");--> statement-breakpoint
CREATE INDEX "downtime_costs_company_month_idx" ON "downtime_costs" USING btree ("company_id","for_month");--> statement-breakpoint
CREATE UNIQUE INDEX "machines_company_serial_key" ON "machines" USING btree ("company_id","serial") WHERE serial IS NOT NULL;--> statement-breakpoint
CREATE INDEX "machines_company_line_idx" ON "machines" USING btree ("company_id","line_id");--> statement-breakpoint
CREATE INDEX "machines_company_type_idx" ON "machines" USING btree ("company_id","machine_type");--> statement-breakpoint
CREATE UNIQUE INDEX "pm_completions_machine_schedule_day_key" ON "pm_completions" USING btree ("machine_id","schedule_id","completed_on");--> statement-breakpoint
CREATE INDEX "pm_completions_company_machine_idx" ON "pm_completions" USING btree ("company_id","machine_id","completed_on");--> statement-breakpoint
CREATE UNIQUE INDEX "pm_schedules_company_type_cadence_key" ON "pm_schedules" USING btree ("company_id","machine_type","cadence");--> statement-breakpoint
CREATE UNIQUE INDEX "spare_parts_company_code_key" ON "spare_parts" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "spare_parts_company_low_idx" ON "spare_parts" USING btree ("company_id","on_hand");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_downtime_key" ON "tickets" USING btree ("company_id","downtime_id") WHERE downtime_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tickets_company_status_idx" ON "tickets" USING btree ("company_id","status","priority","reported_at");--> statement-breakpoint
CREATE INDEX "tickets_company_machine_idx" ON "tickets" USING btree ("company_id","machine_id","reported_at");