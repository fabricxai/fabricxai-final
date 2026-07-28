# FabricXAI — Backend Development Plan
### For execution with Claude Code · v1

**Companion documents (keep all in `/docs` of the repo):**
`fabricxai-backend-briefs.md` (module contracts) · `fabricxai-department-build-pack.md` (frontend prompts + briefs) · `design-handoff-template.md` (per-module bridge) · `theme.css` (design tokens) · `CLAUDE.md` (repo root — provided alongside this plan)

**Prime directive.** Backend for a module is built only after its HANDOFF file exists with §8 empty. The exception is Phase 0/1 (foundation + migration), which has no screens.

---

## 1. Tech stack (final)

| Layer | Choice | Version pin | Why / notes |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | |
| Framework | Next.js (existing app) | 16.x | Server actions + route handlers ARE the backend; no separate API service at this team size |
| Language | TypeScript strict | 5.x | `"strict": true`, no `any` in service layer |
| ORM | Drizzle ORM + drizzle-kit | latest stable | SQL-first, generated migrations, works with plain PG |
| Database | PostgreSQL | 16 | + `pgvector`, `pg_trgm` (duplicate detection), `btree_gin` |
| Pooling | PgBouncer | transaction mode | Next.js route concurrency will exhaust raw connections |
| Cache/queue | Redis | 7 | sessions cache, rate limits, BullMQ backend |
| Jobs | BullMQ | 5.x | separate worker process (`apps/worker` or `src/worker`) — NOT inside Next.js request lifecycle |
| Auth | Better Auth | latest | email+password, email verification, organization plugin → maps to companies/roles |
| Storage | MinIO (S3 API) | latest | all code uses `@aws-sdk/client-s3`; provider-portable |
| AI | Vercel AI SDK | existing | Anthropic (reasoning), Gemini (extraction), OpenAI (embeddings) — keep model registry |
| Email | Resend or Amazon SES | — | transactional only; never self-hosted SMTP |
| PDF render | Playwright (chromium) HTML→PDF in worker | — | one pipeline: PO, payslip, packing list, QC pack, UD recon |
| Validation | Zod | 4.x | one schema per module payload; shared with pending_changes |
| Testing | Vitest + Testcontainers (PG) + Playwright (later) | — | see §7 |
| Load testing | k6 | — | scenarios per module NFR (§9 of handoffs) |
| Errors/monitoring | Sentry + Uptime Kuma | — | |
| Proxy | Caddy | 2 | automatic TLS |
| Containers | Docker Compose | — | one file runs everything, dev == prod shape |
| Backups | pgBackRest → offsite (R2/B2) | — | non-negotiable before first real factory data |
| CI/CD | GitHub Actions | — | lint, typecheck, test, migrate-check, deploy over SSH |

**Explicit non-choices:** no NestJS (unneeded layer), no Prisma (heavier, worse raw-SQL story for reporting), no Kafka (outbox+BullMQ is enough), no microservices (modular monolith with enforced module boundaries).

---

## 2. Architecture

### 2.1 Modular monolith layout

```
src/
  app/                    # Next.js routes (thin: parse → call service → respond)
    api/…                 # route handlers (webhooks, agent, offline sync)
    actions/…             # server actions per module
  modules/                # THE backend. One folder per module id.
    core/                 # tenancy, auth glue, pending-changes, audit, outbox,
                          # documents, notifications, module-registry
    buyers/               # 1.1
    rfq/                  # 1.2
    orders/               # 1.3 (+ tna/, lc shared ownership → see 2.3)
    sampling/             # 1.4
    commercial/           # 2.1 lc-docs, 2.2 ud
    store/                # 3.1
    procurement/          # 3.2
    planning/             # 4.1
    cutting/              # 5.1
    production/           # 6.1
    quality/              # 7.1
    shipment/             # 8.1
    maintenance/          # 9.1
    workforce/            # 10.1  (isolated: own drizzle schema file, 🔒)
    compliance/           # 10.2
    finance/              # 11.1
    analytics/            # 11.2 (read-only — lint rule: may not import write ops)
    settings/             # X.3
    marbim/               # X.2 (tool packs registered per module)
  db/
    schema/               # drizzle schema, one file per module + core.ts
    migrations/           # generated
    seed/                 # factory-scale seed generator (§8)
  worker/                 # BullMQ processors, one file per job family
  lib/                    # shared: money, dates(bn), i18n, s3, pdf, ids
```

**Module folder contract** (every module identical — this is what makes Claude Code fast and safe here):

```
modules/<name>/
  schema.ts        # drizzle tables (re-exported by db/schema)
  service.ts       # ALL business logic; pure where possible
  actions.ts       # server actions = auth check → zod parse → service
  queries.ts       # read models for screens (from HANDOFF §3)
  zod.ts           # payload schemas incl. pending_changes payloads
  events.ts        # outbox event names + payload types
  jobs.ts          # BullMQ processors owned by this module
  tools.ts         # MARBIM tool pack (read + draft only)
  register.ts      # registerModule({ id, pendingTargets, zodMap,
                   #   approvalDefaults, toolPack, jobs })
  __tests__/
```

### 2.2 Core invariants (implemented once in `modules/core`, consumed everywhere)

1. **Tenancy.** `withCompany(ctx)` wrapper: every service function takes `ctx {companyId, userId, role}`; repository helpers auto-scope. Plus Postgres RLS with `SET LOCAL app.company_id` per transaction as the second wall. Cross-tenant test in CI (§7).
2. **pending_changes.** Insert validates target against the module registry whitelist + module Zod; approve re-validates, checks `approval_rules`, commits in one transaction, writes `audit_log`, emits `approve.committed`. Per-field confidence jsonb (no constants — extraction must supply real values).
3. **Money.** `Money {amount: string(numeric), currency}` type; arithmetic via helper lib (no float math anywhere — lint rule bans `parseFloat` in modules).
4. **State machines.** `defineStateMachine()` helper; transitions from HANDOFF §6; illegal transition ⇒ 409 typed error.
5. **Outbox.** Same-transaction event insert; worker relays to BullMQ; handlers idempotent (dedupe on event id).
6. **Offline sync.** One endpoint: batch upsert with `offline_key` idempotency, per-row results — used by store, cutting, production, sampling, QC inline.
7. **Audit (⚖).** Service-layer interceptor on registered tables: before/after into `audit_log`. Payroll reads audited too (🔒).
8. **Gates.** Server-side precondition helpers returning structured errors: PP-approval gate (cutting), UD balance (bonded issues), BTB headroom (import PO), EXP number (bank docs), LC latest-shipment conflict.

### 2.3 Shared-ownership tables
`lcs`/`btb_lcs`: schema lives in `commercial/`, Orders links via `order_lcs` and reads through `commercial/queries`. `endline_counts`: production writes, quality co-writes via production's service API. One writer-module per table, enforced by convention + review.

---

## 3. Environments & configuration

- `docker-compose.dev.yml`: postgres, pgbouncer, redis, minio, mailpit (dev SMTP), app (`next dev`), worker (`tsx watch`).
- `docker-compose.prod.yml`: adds caddy, sentry env, restart policies, resource limits; app built image; worker separate container; pgbackrest sidecar/cron.
- `.env` (validated at boot with Zod — fail fast, list missing keys): `DATABASE_URL` (via pgbouncer), `DIRECT_DATABASE_URL` (migrations bypass pooler), `REDIS_URL`, `S3_*`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`/SES, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `SENTRY_DSN`, `APP_URL`.
- VPS baseline: Ubuntu 24.04, 8 vCPU / 16 GB / NVMe to start; ufw (80/443/SSH only), fail2ban, unattended-upgrades. Dhaka-region or Singapore VPS for latency.

---

## 4. Phase plan

Estimates assume Claude Code doing implementation with you reviewing; adjust to your review bandwidth. Each module phase = HANDOFF exists → build → tests → k6 (if ⚡/floor) → demo with seed data.

### Phase 0 — Foundation (no designs needed) · ~1–2 weeks
*(GREENFIELD: no prior repo, no Supabase. Steps referencing existing code/migrations are void — see PLAYBOOK §1 for the scaffold-from-scratch version. Exit criteria replaced by the playbook's greenfield exit criteria.)*
1. Repo restructure to §2.1 (move, don't rewrite, existing RFQ code into `modules/rfq`).
2. Drizzle + PG16 + PgBouncer up; port existing Supabase migrations into drizzle schema (`core.ts`: companies, users bridge, profiles, roles).
3. Better Auth integration (email verify via mailpit in dev); organization plugin mapped to companies; role claims into `ctx`.
4. `modules/core` complete: tenancy wrapper + RLS session var, pending_changes v2 (whitelist, zodMap, per-field confidence, approval_rules), audit_log, outbox + worker skeleton, documents + MinIO, notification service, offline sync endpoint, state-machine + gate helpers, Money lib.
5. CI: lint (incl. custom rules: no-float-money, analytics-no-writes), typecheck, vitest, drizzle migrate-check, docker build.
6. **Exit criteria:** existing RFQ module runs end-to-end on the new stack locally (auth, extraction→pending→approve, files on MinIO), `USE_LOCALSTORAGE_FALLBACK` deleted.

### Phase 1 — VOID in greenfield (no Supabase exists) · 0 days
*(Original Supabase migration steps retained below only for reference if a legacy deployment ever appears.)*

### Phase 1 (legacy reference) — Supabase migration · ~2–4 days
1. Data: pg_dump Supabase → transform (auth.users → Better Auth users table with password-reset-on-first-login flow, since hashes won't port cleanly; map profiles/companies ids stable), load, verify counts + spot checks.
2. Storage: `rclone` Supabase storage → MinIO, rewrite `documents.bucket_key`.
3. Decommission checklist: freeze Supabase writes → final delta sync → DNS/env cutover → keep read-only snapshot 30 days.
4. **Exit criteria:** production users log in on VPS stack; zero Supabase imports left in code (`grep -r "supabase" src/` returns only the migration folder).

### Phase 2 — Trust layer: X.1 Approve Inbox + X.2 MARBIM platform · ~1 week
Handoff X.1 already drafted as the template example. Build: approve list/batch/diff APIs, extraction moved to BullMQ with per-company rate limits, correction telemetry, per-module tool-pack registry.

### Phase 3 — 1.3 Orders & TNA (+ LC tables with 2.1 schema) · ~2–3 weeks
The flagship. Breakdown revisions, TNA engine (backward scheduling, ripple preview as pure function — heavy unit tests), LC conflict detector, gates wiring, nightly TNA scan job, owner digest.

### Phase 4 — Floor spine: 3.1 Store + 6.1 Production ⚡ · ~2–3 weeks
Offline batch endpoint hardened; store GRN/rolls/issues with UD draw (2.2 check API stubbed against real `uds` table); production burst-write path; `hourly_outputs` partitioned by month from the first migration; **k6 scenario `production_burst.js` must pass before phase closes** (50 lines × 10 concurrent entry bursts + 20 dashboard readers: p95 write < 500ms, p95 board read < 800ms on VPS-class hardware).

### Phase 5 — 1.2 RFQ refinement + 1.5 Costing + 4.1 Planning · ~2 weeks
RFQ built fresh here (greenfield: no Wave 1 to refine) with real per-field confidence from day one; quote↔cost-sheet link; capacity query + scenarios.

### Phase 6 — 7.1 Quality + 5.1 Cutting + 8.1 Shipment + 3.2 Procurement · ~2–3 weeks
AQL tables seeded + server-computed; bundle QR; packing validation; EXP gate; PO PDF pipeline (first Playwright-PDF consumer); supplier scores job.

### Phase 7 — 2.1 LC docs + 2.2 UD full + 11.1 Finance · ~2 weeks
Submission lifecycle, realization → receivables, UD reconciliation PDF, profitability waterfall (needs Store actuals + payroll allocation stub until Phase 8).

### Phase 8 — 10.1 Workforce & Payroll 🔒 + 10.2 Compliance + 9.1 Maintenance · ~2–3 weeks
Payroll compute as pure function with gazette test-vector suite (write the test cases from the current gazette BEFORE the implementation); API-level role lockout tests; attendance device-file importer (CSV formats vary — build as pluggable parsers); compliance extraction; maintenance auto-tickets (wire from Phase 4 downtime events).

### Phase 9 — 11.2 Analytics + X.3 Settings completion + hardening · ~2 weeks
Materialized exceptions feed, cached aggregates, scheduled exports; approval_rules UI-backing APIs, module toggles enforcement middleware; full k6 pass (all scenarios), security review (§6), backup restore drill (actually restore to a scratch VPS — a backup that's never been restored doesn't exist).

**Total honest range: ~4–6 months to a pilot-ready system**, pilotable earlier: after Phase 4 a factory can run orders + store + production tracking for real while later phases land.

---

## 5. Claude Code working agreement (how to actually run this)

- One module per session-thread; start every module session by pointing Claude Code at: `CLAUDE.md`, the module's HANDOFF file, its section in `fabricxai-backend-briefs.md`.
- Order inside a module: `schema.ts` → migration → `zod.ts` → `service.ts` with tests → `queries.ts` (from HANDOFF §3 exactly) → `actions.ts` → `jobs.ts`/`events.ts` → `tools.ts` → `register.ts`.
- Definition of done (enforce in review, listed in CLAUDE.md): all HANDOFF §5 operations exist with matching names; state machines match §6; gates server-side; tests green incl. tenancy + state-machine suites; seed extended per §10; no `any`, no float money, no raw `db` calls in actions (service only); i18n keys not hardcoded strings in errors surfaced to UI.
- Commit convention `feat(orders): tna ripple preview` etc.; one PR per module phase-slice; Claude Code writes the PR description from the HANDOFF diff.
- Never let Claude Code "improve" core invariants inside a module PR — core changes are their own PR with their own review.

---

## 6. Security checklist (Phase 9 gate, but built-in from Phase 0)

- [ ] RLS active on all tenant tables + cross-tenant CI test (user A queries company B ⇒ 0 rows)
- [ ] pending_changes: whitelist + Zod at insert AND approve; approval_rules enforced
- [ ] Payroll 🔒: 403 without body shape for non-HR/owner; reads audited
- [ ] Rate limits: auth endpoints, MARBIM chat, extraction queue (per company + per user)
- [ ] File uploads: mime/size validation, S3 keys unguessable, no public buckets
- [ ] Secrets only via env; `.env` never in image; Better Auth secret rotation documented
- [ ] Headers via middleware (CSP, frame-deny), CSRF per Better Auth guidance
- [ ] Dependency audit in CI; Postgres + OS patch cadence documented
- [ ] Backup restore drill performed and timed (RTO target: ≤ 4h, RPO ≤ 15min via WAL)

---

## 7. Testing strategy

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | pure functions: TNA scheduling/ripple, payroll compute (gazette vectors), AQL lookup, capacity math, wastage, Money lib |
| Integration | Vitest + Testcontainers PG | services against real Postgres: state machines, gates, pending flow, tenancy, offline idempotency (replay same offline_key ⇒ one row) |
| Contract | Vitest | every HANDOFF §5 operation exists + zod schemas accept the §3 payloads (generated table-driven test from handoff frontmatter if you keep them machine-readable) |
| Load ⚡ | k6 | `production_burst.js`, `approve_inbox.js`, `store_grn.js`, `owner_dashboard.js` — run against staging compose on VPS-class VM |
| E2E | Playwright | after Phase 4, the golden path: RFQ→order→store issue→production→approve inbox |

Seed generator (`db/seed`): factory-scale realistic data — 1 company, 40 buyers, 250 orders (2 yrs), 50 lines, 1.2M hourly_outputs rows, 30k rolls, 2,400 workers, deliberate edge rows (LC conflict, overdrawn UD attempt, 38% line, negative-margin order). Same generator feeds demos, k6, and dev.

---

## 8. Observability & ops

- Sentry: app + worker, release-tagged; alert on job failure rate + p95 route latency.
- Uptime Kuma: app, worker heartbeat job, postgres, redis, minio.
- pg: `pg_stat_statements` on; slow-query log > 200ms reviewed weekly during phases 3–6.
- Dashboards later; logs via docker json + `dozzle` is enough to start.
- Runbooks in `/docs/runbooks/`: restore-from-backup, rotate-secrets, resync-offline-conflicts, requeue-failed-jobs.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Handoffs skipped under time pressure → design/backend drift | Prime directive + PR template requires HANDOFF link |
| Payroll bug = real people underpaid | pure function + gazette vectors + owner approval gate + parallel-run one month against current Excel before go-live |
| Offline conflicts on floor devices | idempotency keys + last-write-wins per line-hour + conflict report screen (runbook) |
| VPS single point of failure | backups + restore drill + compose portability; add hot standby when first paying factory onboards |
| Auth migration locks users out | password-reset-on-first-login flow tested with pilot users before cutover |
| AI extraction cost/latency spikes | queue + per-company limits + Gemini for extraction (cheap) reserving Anthropic for reasoning |
