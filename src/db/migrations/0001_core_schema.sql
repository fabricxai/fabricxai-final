CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete', 'read', 'approve', 'reject', 'login', 'export');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'processing', 'ready', 'quarantined', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."pending_operation" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."pending_source" AS ENUM('ai_extraction', 'ai_chat', 'user_draft', 'import', 'integration');--> statement-breakpoint
CREATE TYPE "public"."pending_status" AS ENUM('pending', 'approved', 'committed', 'rejected', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('owner', 'admin', 'merchandiser', 'commercial', 'planner', 'store', 'procurement', 'cutting', 'production', 'quality', 'shipment', 'maintenance', 'hr', 'compliance', 'finance', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"target_table" text,
	"operation" "pending_operation",
	"condition" jsonb,
	"required_roles" "role_name"[] NOT NULL,
	"approvals_required" integer DEFAULT 1 NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"min_confidence" numeric(4, 3),
	"priority" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_rules_approvals_positive" CHECK ("approval_rules"."approvals_required" >= 1),
	CONSTRAINT "approval_rules_min_confidence_range" CHECK ("approval_rules"."min_confidence" IS NULL
      OR ("approval_rules"."min_confidence" >= 0 AND "approval_rules"."min_confidence" <= 1)),
	CONSTRAINT "approval_rules_auto_requires_floor" CHECK ("approval_rules"."auto_approve" = false OR "approval_rules"."min_confidence" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "approval_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_role" "role_name",
	"action" "audit_action" NOT NULL,
	"target_table" text NOT NULL,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"changed_fields" text[],
	"pending_change_id" uuid,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"slug" text NOT NULL,
	"bin" text,
	"bonded_license_no" text,
	"factory_license_no" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"local_currency" text DEFAULT 'BDT' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'Asia/Dhaka' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "companies_base_currency_iso" CHECK (char_length("companies"."base_currency") = 3),
	CONSTRAINT "companies_local_currency_iso" CHECK (char_length("companies"."local_currency") = 3)
);
--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"kind" text,
	"module_id" text,
	"entity_table" text,
	"entity_id" text,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_size_positive" CHECK ("documents"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text,
	"role" "role_name",
	"kind" text NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"title_key" text NOT NULL,
	"body_key" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"module_id" text,
	"entity_table" text,
	"entity_id" text,
	"href" text,
	"dedupe_key" text,
	"channels" text[] DEFAULT ARRAY['in_app']::text[] NOT NULL,
	"emailed_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_has_recipient" CHECK ("notifications"."user_id" IS NOT NULL OR "notifications"."role" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"aggregate_table" text,
	"aggregate_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pending_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"target_table" text NOT NULL,
	"target_id" text,
	"operation" "pending_operation" NOT NULL,
	"payload" jsonb NOT NULL,
	"zod_schema_key" text NOT NULL,
	"field_confidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_min" numeric(4, 3),
	"source" "pending_source" NOT NULL,
	"source_document_id" uuid,
	"extractor_version" text,
	"model" text,
	"status" "pending_status" DEFAULT 'pending' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"corrections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"committed_at" timestamp with time zone,
	"committed_row_id" text,
	"error" jsonb,
	CONSTRAINT "pending_changes_target_table_is_identifier" CHECK ("pending_changes"."target_table" ~ '^[a-z_][a-z0-9_]*$'),
	CONSTRAINT "pending_changes_confidence_range" CHECK ("pending_changes"."confidence_min" IS NULL
      OR ("pending_changes"."confidence_min" >= 0 AND "pending_changes"."confidence_min" <= 1)),
	CONSTRAINT "pending_changes_target_id_matches_operation" CHECK (("pending_changes"."operation" = 'insert' AND "pending_changes"."target_id" IS NULL)
        OR ("pending_changes"."operation" <> 'insert' AND "pending_changes"."target_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "pending_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" uuid NOT NULL,
	"queue" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text,
	"phone" text,
	"avatar_url" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"department" text,
	"default_company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "role_name" NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_pending_change_id_pending_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "public"."pending_changes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_changes" ADD CONSTRAINT "pending_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_changes" ADD CONSTRAINT "pending_changes_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_changes" ADD CONSTRAINT "pending_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_changes" ADD CONSTRAINT "pending_changes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_default_company_id_companies_id_fk" FOREIGN KEY ("default_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_rules_lookup_idx" ON "approval_rules" USING btree ("company_id","module_id","is_active","priority" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("company_id","target_table","target_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_company_time_idx" ON "audit_log" USING btree ("company_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("company_id","actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_pending_idx" ON "audit_log" USING btree ("pending_change_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_key" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_bucket_object_key" ON "documents" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE INDEX "documents_company_created_idx" ON "documents" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_company_entity_idx" ON "documents" USING btree ("company_id","entity_table","entity_id");--> statement-breakpoint
CREATE INDEX "documents_company_kind_idx" ON "documents" USING btree ("company_id","kind");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("company_id","user_id","created_at" DESC NULLS LAST) WHERE read_at IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_role_idx" ON "notifications" USING btree ("company_id","role","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key" ON "notifications" USING btree ("company_id","dedupe_key") WHERE dedupe_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox" USING btree ("occurred_at") WHERE published_at IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_company_event_idx" ON "outbox" USING btree ("company_id","event_name","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pending_changes_company_status_idx" ON "pending_changes" USING btree ("company_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pending_changes_company_module_idx" ON "pending_changes" USING btree ("company_id","module_id","status");--> statement-breakpoint
CREATE INDEX "pending_changes_target_idx" ON "pending_changes" USING btree ("company_id","target_table","target_id");--> statement-breakpoint
CREATE INDEX "pending_changes_document_idx" ON "pending_changes" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "pending_changes_confidence_idx" ON "pending_changes" USING btree ("company_id","confidence_min");--> statement-breakpoint
CREATE UNIQUE INDEX "processed_events_pk" ON "processed_events" USING btree ("event_id","queue");--> statement-breakpoint
CREATE INDEX "processed_events_time_idx" ON "processed_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "profiles_default_company_idx" ON "profiles" USING btree ("default_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_company_user_role_key" ON "roles" USING btree ("company_id","user_id","role");--> statement-breakpoint
CREATE INDEX "roles_user_idx" ON "roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "roles_company_role_idx" ON "roles" USING btree ("company_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));