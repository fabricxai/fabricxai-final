# 1.1 Buyer & Lead Desk

**Department:** DEPT 1 — MERCHANDISING
**Companions:** `PLAYBOOK.md` (process) · `docs/handoffs/HANDOFF-1-1-buyer-lead-desk.md` (final contract, created after design lock) · `CLAUDE.md` (repo rules)

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
- `leads`: source enum(fair, referral, buying_house, inbound, other), company_name, country, agent_id? → `agents`, stage enum(new, contacted, sampling_talk, negotiation, won, lost), lost_reason?, quiet_since (derived), notes
- `agents`: name, type enum(buying_house, individual), commission_pct, contacts
- `lead_activities`: lead_id, kind enum(call, email, meeting, note), summary, occurred_at
- `buyers`: name, brands[], country, website, status enum(active, dormant, blacklisted)
- `buyer_contacts`: buyer_id, name, role enum(merchandiser, qa, sourcing, finance, other), email, phone, is_primary
- `buyer_terms` ⚖ (versioned): buyer_id, payment enum(lc, tt, dp), incoterm, tolerance_pct, aql_level enum(1.5, 2.5, 4.0), nominated_banks[], nominated_forwarders[], nominated_labs[], valid_from
- `buyer_requirements`: buyer_id, text, category, source_doc_id?, source_page?
- `buyer_documents`: buyer_id, document_id, kind enum(manual, agreement, coc, other)

**Operations**
- `convertLead(leadId)` → creates buyer + carries contacts/activities, closes lead as won. Idempotent.
- `detectDuplicates(name, domain)` on lead/buyer create — trigram similarity ≥ 0.6 returns candidates; UI confirms.
- `logActivity`, `upsertTerms` (new version row; changes route through pending_changes, approver: manager).
- Extraction job: buyer manual PDF → `buyer_requirements` drafts (one pending_change containing the batch).

**Events / jobs**
- `leads.quiet` nightly scan (stage active + no activity 14d) → reminder notification.
- `buyers.terms_changed` → invalidate downstream defaults caches.

**Roles** — merchandiser: CRUD own-assigned leads/buyers; manager: all + terms approval; viewer: read.

**BD rules** — agent commission % lives on lead, snapshots onto orders at creation (never live-linked — commission disputes are real). Nominated banks/forwarders/labs are the defaults Shipment, Commercial, and QC read.

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
