# 3.1 Fabric & Trims Store

**Department:** DEPT 3 — STORE
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-3-1-fabric-trims-store.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `items`: kind enum(fabric, trim, accessory), name, spec jsonb (fabric: construction, composition, gsm, width; trim: spec), uom
- `supplier_pos` → see 3.2/Procurement (GRN references them)
- `grns`: supplier_po_id?, challan_no, received_at, bonded bool, ud_id?, inspection_status enum(pending, passed, failed_partial, failed), lines jsonb[] or `grn_lines` table (item_id, qty, unit_price?)
- `rolls`: grn_line_id, roll_no, lot, dye_lot, shade_group, qty, uom, location_id, status enum(in_stock, issued, returned, adjusted_out)
- `locations`: kind enum(bonded, general, floor), name
- `requisitions`: order_id, computed_lines jsonb[] (item, required_qty — from cost-sheet consumption × order qty × (1+wastage)), status
- `issues`: requisition_id, order_id, lines[] (item, qty, roll_ids[]), issued_at, offline_key (idempotency)
- `returns`, `adjustments` ⚖ (reason_code, qty ±, via pending_changes)

**Operations**
- GRN create (offline-queued, idempotent by device+local id); bonded ⇒ `ud_id` required + balance check.
- Issue: validates requisition remaining; bonded rolls ⇒ UD draw; shade-mix check (order already drew shade X, picking Y ⇒ warning flag in response, UI decides).
- Stock queries: on-hand / reserved (open requisitions) / free, by item·location·roll. Must stay fast at 10⁵ roll rows — covering indexes on (company_id, item_id, status), (company_id, location_id).
- Consumption accrual per order → Costing actuals.

**Jobs** — inspection-pending reminders; low-stock scan vs cutting dates within 14d; dead-stock report (no movement 180d).

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
