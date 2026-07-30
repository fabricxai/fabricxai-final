CREATE TABLE "order_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"compiled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actual_consumption_pc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"efficiency_curve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_defects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delay_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compiled_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quoted_margin_pct" numeric(7, 2),
	"actual_margin_pct" numeric(7, 2),
	"margin_basis" text,
	"pieces_produced" integer DEFAULT 0 NOT NULL,
	"merchandiser_note" text,
	"note_updated_at" timestamp with time zone,
	"note_updated_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_outcomes_pieces_nonneg" CHECK ("order_outcomes"."pieces_produced" >= 0),
	CONSTRAINT "order_outcomes_margin_basis" CHECK ("order_outcomes"."margin_basis" IS NULL OR "order_outcomes"."margin_basis" IN ('price', 'cost')),
	CONSTRAINT "order_outcomes_margins_paired" CHECK (("order_outcomes"."quoted_margin_pct" IS NULL) = ("order_outcomes"."actual_margin_pct" IS NULL)
          AND ("order_outcomes"."quoted_margin_pct" IS NULL) = ("order_outcomes"."margin_basis" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "order_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "style_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"style_code" text NOT NULL,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text NOT NULL,
	"source_hash" text NOT NULL,
	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "style_fingerprints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_outcomes" ADD CONSTRAINT "order_outcomes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_outcomes" ADD CONSTRAINT "order_outcomes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_outcomes" ADD CONSTRAINT "order_outcomes_note_updated_by_users_id_fk" FOREIGN KEY ("note_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_outcomes" ADD CONSTRAINT "order_outcomes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_fingerprints" ADD CONSTRAINT "style_fingerprints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_fingerprints" ADD CONSTRAINT "style_fingerprints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_outcomes_order_key" ON "order_outcomes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_outcomes_company_compiled_idx" ON "order_outcomes" USING btree ("company_id","compiled_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "style_fingerprints_company_style_key" ON "style_fingerprints" USING btree ("company_id","style_code");--> statement-breakpoint
CREATE INDEX "style_fingerprints_embedding_idx" ON "style_fingerprints" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "style_fingerprints_company_model_idx" ON "style_fingerprints" USING btree ("company_id","model");