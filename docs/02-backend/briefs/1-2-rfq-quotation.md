# 1.2 RFQ & Quotation

**Department:** DEPT 1 — MERCHANDISING
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-1-2-rfq-quotation.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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

**Entities** *(Wave 1 exists; deltas marked ✚)*
- `rfqs`: buyer_id, title, product_type, description, quantity, unit, size_ratio jsonb ✚, target_price, target_currency ✚, currency, deadline, status enum(open, clarifying ✚, quoted, won, lost, cancelled), source enum(manual, ai_extracted), loss_reason_code? ✚
- `rfq_clarifications`: rfq_id, question, asked_at, answered_at?, answer?
- `quotes`: rfq_id, version, cost_sheet_id? ✚ → Costing, fob_breakdown jsonb (fabric, trims, cm, embellishment, commercial, margin), fob_price, cm_bdt_equiv ✚, validity_date, status enum(draft, sent, superseded)
- `loss_reasons`: code, label (seeded taxonomy: price, capacity, compliance, sample, other)

**Operations**
- Extraction (exists): text/PDF/photo → pending_change. Extend: measured per-field confidence from the extraction model, not a constant. ⚠ replace hardcoded 0.85.
- `draftQuote(rfqId)`: requires approved cost sheet; computes fob_breakdown; new version supersedes prior.
- `markWon(rfqId)` → emits `rfq.won` with order-creation payload (buyer, styles, qty+ratio, price, requested dates). `markLost` requires loss_reason_code.

**Events / jobs** — `rfq.deadline_near` (48h), `rfq.clarification_stale` (5d unanswered).

**Roles** — merchandiser: own buyers' RFQs; manager: all; quote send requires manager approval if margin < company floor (Settings).

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
