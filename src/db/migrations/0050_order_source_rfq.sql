ALTER TABLE "orders" ADD COLUMN "source_rfq_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_source_rfq_key" ON "orders" USING btree ("source_rfq_id") WHERE source_rfq_id IS NOT NULL;