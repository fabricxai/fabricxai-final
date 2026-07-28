ALTER TABLE "order_styles" ADD COLUMN "contracted_qty" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "qty_tolerance_pct" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_styles" ADD CONSTRAINT "order_styles_contracted_qty_positive" CHECK ("order_styles"."contracted_qty" IS NULL OR "order_styles"."contracted_qty" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_qty_tolerance_range" CHECK ("orders"."qty_tolerance_pct" >= 0 AND "orders"."qty_tolerance_pct" <= 100);