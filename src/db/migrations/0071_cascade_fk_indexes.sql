-- ============================================================================
-- Covering indexes for ON DELETE CASCADE foreign keys.
--
-- Postgres does not index the child side of a foreign key for you. Without one,
-- two things happen (audit DB-M4):
--
--  1. **Every parent delete sequentially scans the child, under lock.** Deleting
--     one company cascades through ~30 tables; on a factory-scale database that
--     is a scan per table with the parent row locked throughout.
--  2. **Where the FK column is ALSO a read path, every read scans.** This is the
--     sharper problem and it is not hypothetical: `notifications.user_id` is what
--     the notification bell filters on, the table's only index was
--     `(company_id, role, created_at DESC)`, and the bell therefore did a
--     sequential scan plus a sort on every page load of every screen.
--
-- 32 single-column cascade FKs had no covering index. This adds 24. The eight
-- skipped are on tables that hold tens of rows per company — a scan of a lookup
-- table is cheaper than the write cost of maintaining an index on it, and an
-- index nobody's plan uses is pure overhead on every insert.
--
-- Where the FK column is part of a real query the index is COMPOSITE and ordered
-- to serve that query, rather than being a bare FK index that only helps the
-- delete. Where it exists only for the cascade, it is a single column.
-- ============================================================================

-- ── Read paths, not just cascades ────────────────────────────────────────────

-- The notification bell: `where company_id = ? and user_id = ? order by created_at desc`.
-- Composite and DESC so the ORDER BY is satisfied by the index and the sort disappears.
CREATE INDEX IF NOT EXISTS notifications_company_user_created_idx
  ON notifications (company_id, user_id, created_at DESC);--> statement-breakpoint

-- Roll-level stock is read by GRN line constantly (3.1 targets 10^5 rolls).
CREATE INDEX IF NOT EXISTS rolls_grn_line_idx ON rolls (grn_line_id);--> statement-breakpoint

-- Downtime by line, newest first — the line-tracking screen and the 9.1 auto-ticket path.
CREATE INDEX IF NOT EXISTS downtimes_line_started_idx
  ON downtimes (line_id, started_at DESC);--> statement-breakpoint

-- Inline QC by line: the inline check screen reads the line's recent checks.
CREATE INDEX IF NOT EXISTS inline_checks_line_idx ON inline_checks (line_id);--> statement-breakpoint

-- Fabric inspections roll up to their GRN (store's inspection_status is derived from them).
CREATE INDEX IF NOT EXISTS fabric_inspections_grn_idx ON fabric_inspections (grn_id);--> statement-breakpoint

-- ── Line tables · always read through their parent ───────────────────────────
CREATE INDEX IF NOT EXISTS grn_lines_grn_idx ON grn_lines (grn_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issue_lines_issue_idx ON issue_lines (issue_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bom_lines_bom_idx ON bom_lines (bom_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchase_requisition_lines_pr_idx
  ON purchase_requisition_lines (purchase_requisition_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS supplier_po_lines_po_idx ON supplier_po_lines (supplier_po_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS supplier_quote_lines_quote_idx
  ON supplier_quote_lines (supplier_quote_id);--> statement-breakpoint

-- ── Order-scoped children ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS allocations_order_idx ON allocations (order_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS allocations_order_style_idx ON allocations (order_style_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cartons_order_idx ON cartons (order_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS measurement_checks_order_idx ON measurement_checks (order_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sample_requests_order_idx ON sample_requests (order_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS third_party_inspections_order_idx
  ON third_party_inspections (order_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS wip_snapshots_order_idx ON wip_snapshots (order_id);--> statement-breakpoint

-- ── Documents · one parent, five child tables ────────────────────────────────
--
-- Deleting a document cascades to all of these, and a soft-deleted document that
-- is later hard-deleted would otherwise scan every one.
CREATE INDEX IF NOT EXISTS order_files_document_idx ON order_files (document_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS buyer_documents_document_idx ON buyer_documents (document_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sample_photos_document_idx ON sample_photos (document_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS final_inspection_photos_document_idx
  ON final_inspection_photos (document_id);--> statement-breakpoint

-- ── The rest ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS findings_audit_idx ON findings (audit_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bank_charges_lc_idx ON bank_charges (lc_id);
