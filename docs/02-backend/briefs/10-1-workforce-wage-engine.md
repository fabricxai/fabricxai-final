# 10.1 Workforce & Wage Engine ⚖ 🔒

**Department:** DEPT 10 — HR, PAYROLL & COMPLIANCE
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-10-1-workforce-wage-engine.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `workers`: employee_no, name, name_bn, photo document_id, designation, grade → wage_grades, section, line_id?, join_date, exit_date?, disbursement jsonb (type enum(bank, bkash, nagad, cash), ref), status
- `wage_grades` (gazette-versioned): gazette_version, grade, basic, house_rent, medical, transport, food, effective_from
- `attendance`: worker_id, date, in_at?, out_at?, status enum(present, absent, leave, holiday), source enum(device, manual), exception? enum(missed_punch, late, mismatch)
- `leaves`: worker_id, kind enum(earned, casual, sick, maternity), from, to, approved_by
- `payroll_runs` ⚖: period, gazette_version, status enum(draft, computed, approved, disbursed), approved_by?, disbursed_at?
- `payroll_lines`: run_id, worker_id, components jsonb (basic, house, medical, transport, food), ot_hours, ot_amount (= hours × 2 × basic/208), attendance_bonus, festival_bonus?, deductions jsonb, gross, net
- `festival_bonus_runs`: festival, period, pro-rata rules snapshot
- `skill_matrix`: worker_id, operation, grade enum(a, b, c)

**Operations**
- Payroll compute = **pure function** `(workers, attendance, grades, rules) → lines`; unit-tested against gazette cases; deterministic re-run.
- Run approval routes through pending_changes → owner. Disbursement sheet export (bank/bKash formats).
- Payslip PDF batch (bn primary + en).
- Anomaly detector on compute (OT > 2.5× worker's 3-mo avg; net delta > threshold) → flags on lines.

**Roles** 🔒 — hr + owner only, enforced at API/RLS level; other roles receive 403 without data shape. Every read of payroll_lines audited.

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
