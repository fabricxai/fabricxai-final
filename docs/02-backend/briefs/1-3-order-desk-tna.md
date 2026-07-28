# 1.3 Order Desk & TNA ⚖

**Department:** DEPT 1 — MERCHANDISING
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-1-3-order-desk-tna.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

## Global conventions

**Global conventions (apply to every module):**

- Every table: `id uuid pk`, `company_id uuid not null → companies`, `created_at`, `updated_at`, `created_by → users`. RLS/tenancy scoping on `company_id` at both ORM layer and Postgres RLS (session var).
- Status fields are enums with explicit state machines documented per module; illegal transitions rejected server-side.
- Money: `numeric(14,2)` + `currency char(3)`; never floats. Quantities: `numeric(12,2)` (fabric meters/kg) or `integer` (pieces). Every API response carries currency/unit.
- All AI/junior-drafted writes flow through `pending_changes` (whitelisted `target_table`, per-module Zod payload schema, routing rule for approver role).
- Soft business documents (PDFs, photos) → S3/MinIO, referenced by `documents(id, bucket_key, mime, size, sha256, label)`.
- Events: emitted to an internal outbox table → consumed by BullMQ jobs (notifications, digests, derived computations). Names given per module as `module.event`.
- Audit: append-only `audit_log(actor, action, table, row_id, before, after)` written by the service layer on every mutation of money-bearing or compliance-bearing tables (marked ⚖ below).

## Module brief

**Entities**
- `orders`: buyer_id, po_numbers text[], total_value, currency, agent_snapshot jsonb?, status enum(confirmed, in_production, shipped_partial, shipped_full, closed, cancelled)
- `order_styles`: order_id, style_code, description, unit_price
- `order_breakdowns`: order_style_id, revision int, color, size, qty. Unique(style, revision, color, size). Active revision pointer on order_styles.
- `order_revisions`: order_id, revision, diff jsonb, buyer_confirmed_at, document_id?
- `lcs` ⚖: buyer_id, number, value, tolerance_pct, currency, issue_date, expiry_date, latest_shipment_date, docs_required jsonb (clause-derived), status enum(draft, active, expired, closed)
- `btb_lcs` ⚖: master_lc_id, number, supplier_id, value, opened_at; constraint: Σ(btb values) ≤ master.value × btb_limit_pct (Settings)
- `order_lcs`: order_id ↔ lc_id (m:n — one LC can cover several POs)
- `tna_templates`: product_type, milestones jsonb[] (name, offset_days_before_exfactory, owner_role, depends_on, critical)
- `tna_milestones`: order_id, name, planned_date, actual_date?, owner_id, depends_on[], critical bool, status derived(pending, on_track, at_risk, late, done)
- `order_files`: order_id, document_id, label

**Operations**
- Create from `rfq.won` payload or from PO extraction draft.
- `saveBreakdown(styleId, cells[])`: validates Σqty within order qty ± buyer tolerance; writes new revision only on buyer-revision flow, else edits active revision pre-production-start.
- `generateTna(orderId, templateId, exFactoryDate)`: backward schedule; respects dependencies.
- `actualizeMilestone(id, date)`: sets actual, recomputes downstream planned dates on critical path, returns ripple preview first (`previewRipple` separate call — UI shows before confirm).
- `applyRevision(orderId, diff)`: from MARBIM diff draft via pending_changes; snapshots new breakdown revision.
- LC conflict detector (pure fn, used by API + nightly job): any linked order with planned ex-factory > lc.latest_shipment_date ⇒ conflict.

**Events / jobs**
- `tna.scan` nightly: recompute milestone statuses; emit `tna.milestone_at_risk` / `.late` → notifications + owner digest queue.
- `lc.countdown` at 21/14/7 days on expiry & latest_shipment with unshipped balance.
- Gate: `sampling.pp_approved(order)` clears the block on the cutting-start milestone; cutting module checks this gate.

**Roles** — merchandiser: own buyers' orders; manager: all; owner: read + money view. Breakdown edits after production start route through pending_changes (approver: manager).

**BD rules** — LC discipline everywhere: conflicts are late-red, surfaced in order book, order detail, shipment, owner exceptions. Partial shipment count per LC terms. EXP gate lives in Shipment but validated here too on close.

## Implementation checklist (standard — every module)

**Precondition:** `docs/handoffs/HANDOFF-<id>.md` exists with §8 empty. The handoff wins on fields/states; this brief wins on invariants (tenancy, money, gates, audit).

Build order inside the module folder `src/modules/<name>/`:
1. `schema.ts` — drizzle tables from Entities above + handoff §4 deltas; generate migration
2. `zod.ts` — payload schemas incl. every pending_changes payload
3. `service.ts` — Operations above; pure functions where possible; write unit tests alongside
4. `queries.ts` — read models matching handoff §3 exactly (fields, sort, pagination)
5. `actions.ts` — thin: auth → zod → service
6. `events.ts` / `jobs.ts` — outbox events + BullMQ processors from Events/jobs above
7. `tools.ts` — MARBIM read + draft tools only
8. `register.ts` — pendingTargets whitelist, zodMap, approvalDefaults, toolPack, jobs
9. Extend `db/seed` per handoff §10 (include the edge rows)
10. Tests green: unit, tenancy (cross-company ⇒ 0 rows), state machines, pending flow, offline idempotency (if floor module)
11. k6 scenario if module is ⚡ or floor-facing (handoff §9)
12. PR: one module slice, description generated from the handoff diff

**Done means:** every handoff §5 operation exists under the same name; §6 state machines enforced server-side; §7 gates server-side; no `any` in service layer; no float money; audit_log written for ⚖ tables.
