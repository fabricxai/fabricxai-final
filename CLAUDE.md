# CLAUDE.md — FabricXAI Platform

AI-powered ERP for Bangladeshi garment export factories. Modular monolith:
Next.js 16 (app router, server actions) + Drizzle + PostgreSQL 16 + Redis/BullMQ
+ MinIO + Better Auth. Frontend uses the design tokens in `src/app/theme.css`.

## Source-of-truth documents (read before working on a module)
- `docs/02-backend/PLAYBOOK.md` — the step-by-step operating manual (start here)
- `docs/02-backend/fabricxai-backend-dev-plan.md` — phases, stack, working agreement
- `docs/02-backend/fabricxai-backend-architecture.md` — topology, layers, data, security
- `docs/02-backend/fabricxai-backend-briefs.md` — draft backend contract per module
  (per-module briefs: `docs/02-backend/briefs/<id>.md`)
- `docs/handoffs/HANDOFF-<module>.md` — FINAL contract per module (wins over the brief on fields/states; the brief wins on invariants)
- `docs/01-design/fabricxai-department-build-pack.md` — screens context per module
- `docs/PROGRESS.md` (module ticks) · `docs/STUBS.md` (owed replacements)

**Never start backend work on a module without its HANDOFF file with §8 empty.**

## Commands
- `pnpm dev` / `pnpm worker:dev` — app / BullMQ worker
- `docker compose -f docker-compose.dev.yml up -d` — pg, pgbouncer, redis, minio, mailpit
- `pnpm db:generate` / `pnpm db:migrate` — drizzle (uses DIRECT_DATABASE_URL)
- `pnpm test` / `pnpm test:integration` — vitest / + testcontainers
- `pnpm seed` — factory-scale seed (also used by k6 and demos)
- `pnpm demo [orders|rfqs|leads]` — the screen-walkthrough scenario, through the
  real services; idempotent, so re-running it is safe. Set `DEMO_COMPANY_ID` when
  more than one company has an owner.
- `pnpm k6 <scenario>` — load scenarios in `k6/`

## Architecture rules (violations = PR rejected)
1. Layers: `app/actions|api` (thin: auth → zod → service) → `modules/<m>/service.ts`
   (all logic) → drizzle. Actions never touch `db` directly.
2. Tenancy: every service fn takes `ctx {companyId, userId, role}` and uses the
   scoped repo helpers from `modules/core`. RLS session var is the second wall,
   never the only wall.
3. AI writes ONLY via `pending_changes` (core): target_table must be registered
   in the module's `register.ts`, payload validated by the module's zod at
   insert AND approve. Confidence is per-field and comes from a measurement —
   constants are lint-banned (`no-invented-confidence`). A source with nothing
   to measure (`ai_chat`: a model composed tool args in conversation) carries
   NO confidence and is refused if it offers one; unscored never auto-approves.
4. Money: `Money` type from `lib/money`; string numerics; `parseFloat`/`Number()`
   on money is lint-banned. Every amount carries currency; USD buyer-facing,
   BDT local.
5. Status fields use `defineStateMachine()`; transitions only per HANDOFF §6;
   illegal transition ⇒ typed 409.
6. Events via the outbox table in the same transaction; BullMQ handlers
   idempotent (dedupe by event id).
7. Floor-facing writes (store, cutting, production, sampling, qc inline) go
   through the offline batch endpoint with `offline_key` idempotency.
8. Gates are server-side and structured: PP-approval (cutting), UD balance
   (bonded issues), BTB headroom (import PO), EXP number (bank docs),
   LC latest-shipment conflict. Never UI-only.
9. `modules/analytics` is read-only — importing any write op there is
   lint-banned. `modules/workforce` payroll: hr+owner roles at API level,
   403 without body shape, reads audited.
10. ⚖ tables (orders, lcs, pending commits, payroll, adjustments, compliance,
    shipments, finance) write `audit_log` via the core interceptor.
11. Shared tables have one writer module (lcs → commercial; endline_counts →
    production). Read across modules via the owner's `queries.ts`, not raw
    tables.
12. Core (`modules/core`) changes are never mixed into a module PR.

## Module folder contract
`schema.ts, zod.ts, service.ts, queries.ts, actions.ts, events.ts, jobs.ts,
tools.ts (MARBIM read+draft only), register.ts (incl. domainPrimer — the
module's versioned prompt fragment giving MARBIM its department craft;
computation stays in service.ts, the primer only teaches when to call it
and how to narrate results), __tests__/`
Build order inside a module: schema → migration → zod → service+tests →
queries (must match HANDOFF §3 exactly) → actions → jobs/events → tools →
register.

## Definition of done (per module)
- Every HANDOFF §5 operation exists with the same name; §6 machines enforced;
  §7 gates wired; §9 NFRs have a k6 scenario if marked ⚡ or floor.
- Tests: unit for pure logic, integration for tenancy (cross-company ⇒ 0 rows),
  state machines, pending flow, offline idempotency where relevant.
- Seed extended per HANDOFF §10 (include the edge rows).
- No `any` in service layer; no hardcoded UI strings (i18n keys); errors
  surfaced to UI are typed.
- PR description generated from the HANDOFF diff; one module slice per PR.

## Style
- TypeScript strict; zod 4; named exports; no default exports in modules.
- Conventional commits: `feat(orders): …`, `fix(store): …`, `core:` prefix
  for modules/core.
- Comments explain WHY (Bangladesh rules especially: UD, LC, gazette wages) —
  the next reader may not know the domain.

## Domain crib (why the weird rules exist)
- LC = Letter of Credit; latest-shipment/expiry conflicts are red alerts
  everywhere. BTB (back-to-back) LC limit is a % of the master LC.
- UD = customs Utilization Declaration for duty-free bonded fabric; bonded
  GRNs/issues must reference a UD; overdraw is legal exposure ⇒ hard block.
- EXP number is mandatory per export shipment before bank submission.
- PP (pre-production) sample approval gates cutting start.
- Wages follow the gazette grade table (versioned); OT = 2× basic hourly
  (basic/208); two festival bonuses/year pro-rated.
- Efficiency = earned minutes (SMV × output) / available minutes.
  DHU = defects per hundred units.
