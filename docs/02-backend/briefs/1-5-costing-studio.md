# 1.5 Costing Studio ⚖

**Department:** DEPT 1 — MERCHANDISING
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-1-5-costing-studio.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `boms`: style_code, source enum(tech_pack_extract, manual, seeded), lines[] → `bom_lines` (group enum(fabric, trims, packing, embellishment), item_ref?, spec text, consumption numeric, uom, wastage_pct, source_doc_id?, source_page?)
- `cost_sheets` ⚖ (versioned): rfq_id? xor style_code, version, status enum(draft, approved, superseded), sections jsonb (fabric[], trims[], cm{method: smv|per_dozen, smv?, efficiency_pct?, labor_rate_bdt?, per_dozen_rate?}, embellishment[], commercial[], margin_pct), fob_price, cm_bdt_pc, approved_by?
- `consumption_templates`: product_type, params jsonb, updated_from_order_id?, usage_count

**Operations**
- `buildFromBom(bomId, templateId?)` — assembles a draft sheet; `computeScenario(sheet, overrides)` pure fn (price/efficiency/fabric-price sliders).
- Approval via pending_changes (approver: manager; margin < company floor from Settings → owner).
- `compareActual(orderId)` — reads 11.1 `order_costs_actual`, returns per-section variance waterfall.
- `refreshTemplate(fromOrderId)` — pending_change updating the product-type template from a closed order's actuals (source: 1.6 outcome).

**Events / jobs** — `costing.sheet_approved` (unlocks quote draft in 1.2); template-staleness report (templates unused/unrefreshed 12 mo).

**Roles** — merchandiser drafts; manager approves; owner approves below-floor margins.

**Feeds** — 1.2 quotes (fob_breakdown = approved sheet), 1.3 requisitions (BOM lines × order qty × wastage), 3.2 (line specs onto supplier inquiries/POs), 11.1 (quoted baseline for variance).
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
