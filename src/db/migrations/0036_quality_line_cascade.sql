ALTER TABLE "inline_checks" DROP CONSTRAINT "inline_checks_line_id_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "inline_checks" ADD CONSTRAINT "inline_checks_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;