# 8.1 Finishing, Cartons & Shipment ⚖

**Department:** DEPT 8 — FINISHING & SHIPMENT
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-8-1-finishing-cartons-shipment.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `finishing_outputs`: order_id, date, cells jsonb (color×size → qty)
- `cartons`: order_id, carton_no, contents jsonb (color×size → qty), gross_kg, net_kg, dims
- `packing_lists`: order_id, shipment_id?, version, generated jsonb, status enum(draft, approved), mismatches jsonb (derived vs breakdown)
- `shipments`: order_id, partial_no, planned_exfactory, actual_exfactory?, forwarder (from buyer nominations), booking_ref?, exp_number?, bl_awb?, port_status enum(planned, ex_factory, at_port, on_board, delivered), lc_id
- `shipment_docs`: shipment_id, checklist jsonb (from lc.docs_required: kind, document_id?, status enum(pending, ready, submitted))

**Operations**
- Carton build validates against remaining-to-pack (finishing minus packed); over-pack rejected with cell detail.
- Packing list generate + approve (locks version); mismatch report.
- `confirmExFactory` → TNA final milestone actualize + Finance invoice draft.
- Gate: docs handoff to bank (2.1 submission) blocked until `exp_number` present — server-enforced.
- Tolerance check: shipped qty within lc tolerance_pct, else structured warning requiring manager pending_change.

**Jobs** — LC latest-shipment countdown on unshipped balance (shared with 1.3/2.1).

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
