# 7.1 Inline, Endline & Final Inspection

**Department:** DEPT 7 — QUALITY
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-7-1-inline-endline-final-inspection.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `defect_codes`: category, code, label (seeded standard taxonomy, company-extendable)
- `inline_checks`: line_id, at, operation, operator_id?, defects jsonb[] (code, count)
- `dhu_daily` (derived): line_id, date, defects, checked, dhu
- `fabric_inspections`: grn_id, roll_id?, points_4 jsonb, result enum(pass, fail), inspector
- `measurement_specs`: style_code, points jsonb[] (name, spec, tol_plus, tol_minus)
- `measurement_checks`: spec_id, order_id, sampled_size, values jsonb, out_of_tol jsonb (derived)
- `aql_tables` (seeded, versioned): level, lot_range → sample_size, accept, reject
- `final_inspections` ⚖: order_id, lot_qty, aql_level (from buyer_terms), sample_size, defects jsonb, verdict enum(pass, fail), photos[], inspector, at
- `third_party_inspections`: order_id, agency enum(sgs, intertek, bv, other), scheduled_at, result?, document_id?

**Operations** — inline capture (≤3-tap payload shape, offline-queued); AQL computed server-side from tables (never client math); buyer report pack generator (PDF: inline history, DHU trend, final AQL) per PO.

**Jobs** — day-close DHU; repeat-defect pattern (same code+operation ≥3 consecutive days) alert; pre-final readiness check vs TNA.

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
