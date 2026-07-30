CREATE TABLE "pending_change_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"pending_change_id" uuid NOT NULL,
	"approver_user_id" text NOT NULL,
	"approved_as_role" "role_name" NOT NULL,
	"corrections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_change_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pending_change_approvals" ADD CONSTRAINT "pending_change_approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_change_approvals" ADD CONSTRAINT "pending_change_approvals_pending_change_id_pending_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "public"."pending_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_change_approvals" ADD CONSTRAINT "pending_change_approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_change_approvals_unique" ON "pending_change_approvals" USING btree ("pending_change_id","approver_user_id");--> statement-breakpoint
CREATE INDEX "pending_change_approvals_company_idx" ON "pending_change_approvals" USING btree ("company_id","pending_change_id");