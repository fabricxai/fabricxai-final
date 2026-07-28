# 6.1 Line Tracking ⚡ *(load-testing target)*

**Department:** DEPT 6 — SEWING / PRODUCTION
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-6-1-line-tracking.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `daily_line_plans`: line_id, date, order_id, target_per_hour, manpower_planned
- `hourly_outputs`: line_id, date, hour, target, actual, entered_by, offline_key — **unique(line_id, date, hour)**, upsert-idempotent
- `downtimes`: line_id, started_at, ended_at?, reason enum(machine, feeding, absent, power, other), machine_id?, ticket_id? (auto)
- `endline_counts`: line_id, date, checked, passed, defective, rework (QC co-writes)
- `efficiency_daily` (derived): line_id, date, earned_min, available_min, efficiency_pct
- `wip_snapshots` (derived hourly): order_id, cut, sewn, finished

**Operations**
- Burst-write hourly upsert API: accepts batches, idempotent by offline_key/unique key, returns per-row status. Target: 50 lines × 10 entries in <2s p95 under concurrent dashboard reads.
- Downtime open/close; reason=machine → auto Maintenance ticket (9.1), link back.
- `runRate(orderId)`: forecast completion date from trailing 3-day rate; compares to TNA sewing milestone.

**Jobs** — hourly WIP snapshot; day-close efficiency compute + owner digest; run-rate risk alerts. Partition `hourly_outputs` by month from day one.

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
