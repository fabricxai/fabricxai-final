ALTER TABLE "final_inspections" ADD COLUMN "offline_key" text;--> statement-breakpoint
ALTER TABLE "measurement_checks" ADD COLUMN "offline_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "final_inspections_offline_key" ON "final_inspections" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "measurement_checks_offline_key_idx" ON "measurement_checks" USING btree ("company_id","offline_key") WHERE offline_key IS NOT NULL;