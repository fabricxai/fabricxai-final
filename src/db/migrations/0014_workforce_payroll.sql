CREATE TYPE "public"."attendance_source" AS ENUM('device', 'manual');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'leave', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."disbursement_type" AS ENUM('bank', 'bkash', 'nagad', 'cash');--> statement-breakpoint
CREATE TYPE "public"."gazette_status" AS ENUM('draft', 'active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."leave_kind" AS ENUM('earned', 'casual', 'sick', 'maternity');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'computed', 'approved', 'disbursed');--> statement-breakpoint
CREATE TYPE "public"."worker_status" AS ENUM('active', 'on_leave', 'exited');--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"date" date NOT NULL,
	"in_at" timestamp with time zone,
	"out_at" timestamp with time zone,
	"status" "attendance_status" NOT NULL,
	"source" "attendance_source" DEFAULT 'device' NOT NULL,
	"exception" text,
	"ot_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_ot_hours_positive" CHECK ("attendance"."ot_hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "festival_bonus_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"festival" text NOT NULL,
	"period" text NOT NULL,
	"rules_snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "festival_bonus_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"kind" "leave_kind" NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaves_range_ordered" CHECK ("leaves"."to_date" >= "leaves"."from_date")
);
--> statement-breakpoint
ALTER TABLE "leaves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payroll_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"payable_days" integer NOT NULL,
	"components" jsonb NOT NULL,
	"ot_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"ot_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"attendance_bonus" numeric(14, 2) DEFAULT '0' NOT NULL,
	"festival_bonus" numeric(14, 2) DEFAULT '0' NOT NULL,
	"deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gross" numeric(14, 2) NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"deduction_carry_forward" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_lines_net_not_negative" CHECK ("payroll_lines"."net" >= 0),
	CONSTRAINT "payroll_lines_currency_iso" CHECK (char_length("payroll_lines"."currency") = 3)
);
--> statement-breakpoint
ALTER TABLE "payroll_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period" text NOT NULL,
	"gazette_id" uuid NOT NULL,
	"rules_snapshot" jsonb NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"disbursed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_period_format" CHECK ("payroll_runs"."period" ~ '^\d{4}-\d{2}$')
);
--> statement-breakpoint
ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_matrix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"skill_grade" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_matrix_grade_valid" CHECK ("skill_matrix"."skill_grade" IN ('a','b','c'))
);
--> statement-breakpoint
ALTER TABLE "skill_matrix" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wage_gazettes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version" text NOT NULL,
	"effective_from" date NOT NULL,
	"status" "gazette_status" DEFAULT 'draft' NOT NULL,
	"document_id" uuid,
	"notes" text,
	"activated_by" text,
	"activated_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wage_gazettes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wage_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"gazette_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"basic" numeric(14, 2) NOT NULL,
	"house_rent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"medical" numeric(14, 2) DEFAULT '0' NOT NULL,
	"transport" numeric(14, 2) DEFAULT '0' NOT NULL,
	"food" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wage_grades_basic_positive" CHECK ("wage_grades"."basic" > 0)
);
--> statement-breakpoint
ALTER TABLE "wage_grades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_no" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"photo_document_id" uuid,
	"designation" text,
	"grade" text NOT NULL,
	"section" text,
	"line_id" uuid,
	"join_date" date NOT NULL,
	"exit_date" date,
	"disbursement_type" "disbursement_type" DEFAULT 'cash' NOT NULL,
	"disbursement_ref" text,
	"status" "worker_status" DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_bonus_runs" ADD CONSTRAINT "festival_bonus_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_bonus_runs" ADD CONSTRAINT "festival_bonus_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_gazette_id_wage_gazettes_id_fk" FOREIGN KEY ("gazette_id") REFERENCES "public"."wage_gazettes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_matrix" ADD CONSTRAINT "skill_matrix_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_matrix" ADD CONSTRAINT "skill_matrix_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_gazettes" ADD CONSTRAINT "wage_gazettes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_gazettes" ADD CONSTRAINT "wage_gazettes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_gazettes" ADD CONSTRAINT "wage_gazettes_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_gazettes" ADD CONSTRAINT "wage_gazettes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_grades" ADD CONSTRAINT "wage_grades_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_grades" ADD CONSTRAINT "wage_grades_gazette_id_wage_gazettes_id_fk" FOREIGN KEY ("gazette_id") REFERENCES "public"."wage_gazettes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_photo_document_id_documents_id_fk" FOREIGN KEY ("photo_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_worker_date_key" ON "attendance" USING btree ("worker_id","date");--> statement-breakpoint
CREATE INDEX "attendance_company_date_idx" ON "attendance" USING btree ("company_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "festival_bonus_runs_company_festival_key" ON "festival_bonus_runs" USING btree ("company_id","festival","period");--> statement-breakpoint
CREATE INDEX "leaves_company_worker_idx" ON "leaves" USING btree ("company_id","worker_id","from_date");--> statement-breakpoint
CREATE INDEX "leaves_company_range_idx" ON "leaves" USING btree ("company_id","from_date","to_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_lines_run_worker_key" ON "payroll_lines" USING btree ("run_id","worker_id");--> statement-breakpoint
CREATE INDEX "payroll_lines_company_run_idx" ON "payroll_lines" USING btree ("company_id","run_id");--> statement-breakpoint
CREATE INDEX "payroll_lines_company_worker_idx" ON "payroll_lines" USING btree ("company_id","worker_id");--> statement-breakpoint
CREATE INDEX "payroll_lines_flags_idx" ON "payroll_lines" USING gin ("flags");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_company_period_key" ON "payroll_runs" USING btree ("company_id","period");--> statement-breakpoint
CREATE INDEX "payroll_runs_company_status_idx" ON "payroll_runs" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_matrix_worker_operation_key" ON "skill_matrix" USING btree ("worker_id","operation");--> statement-breakpoint
CREATE INDEX "skill_matrix_company_operation_idx" ON "skill_matrix" USING btree ("company_id","operation","skill_grade");--> statement-breakpoint
CREATE UNIQUE INDEX "wage_gazettes_company_version_key" ON "wage_gazettes" USING btree ("company_id","version");--> statement-breakpoint
CREATE INDEX "wage_gazettes_company_effective_idx" ON "wage_gazettes" USING btree ("company_id","status","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "wage_grades_gazette_grade_key" ON "wage_grades" USING btree ("gazette_id","grade");--> statement-breakpoint
CREATE INDEX "wage_grades_company_gazette_idx" ON "wage_grades" USING btree ("company_id","gazette_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workers_company_employee_no_key" ON "workers" USING btree ("company_id","employee_no");--> statement-breakpoint
CREATE INDEX "workers_company_status_idx" ON "workers" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "workers_company_grade_idx" ON "workers" USING btree ("company_id","grade");--> statement-breakpoint
CREATE INDEX "workers_company_line_idx" ON "workers" USING btree ("company_id","line_id");