CREATE TYPE "public"."bom_basis" AS ENUM('planned', 'actual');--> statement-breakpoint
ALTER TABLE "bom_lines" ADD COLUMN "consumption_basis" "bom_basis" DEFAULT 'planned' NOT NULL;