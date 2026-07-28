# 1.6 Order Memory

**Department:** DEPT 1 — MERCHANDISING
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-1-6-order-memory.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `style_fingerprints`: style_code, embedding vector(1536) (attributes + tech-pack text via embeddings model), attrs jsonb (product_type, gsm, construction, gauge…)
- `order_outcomes`: order_id, compiled_at, actual_consumption_pc jsonb (per item), efficiency_curve jsonb (day→pct achieved), top_defects jsonb, delay_events jsonb (milestone, days, reason), quoted_margin_pct, actual_margin_pct, merchandiser_note text?

**Operations**
- `embedStyle(styleCode)` on style create/update (queued job).
- `findSimilar(ref, k=3)` — pgvector cosine over company's fingerprints, joined to outcomes; returns match % + outcome summary. Index: HNSW on embedding (per company partial index if needed at scale).
- `seedCostSheet(fromOrderId, targetRfqId)` — copies BOM + consumption actuals into a draft (via pending_changes, source marked seeded).
- Outcome compiler job on `orders.closed`: assembles from 6.1 (efficiency), 7.1 (defects), 1.3 (delays), 11.1 (margins); emits close-out prompt notification to the order's merchandiser for the note.

**Roles** — read: merchandiser+; outcomes immutable once compiled except the note (7-day edit window).

**Feeds** — 1.2 similar-orders panel, 1.5 seeding + template refresh, MARBIM tool `find_similar_orders` (read-only).
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
