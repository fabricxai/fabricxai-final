# FabricXAI — Backend System Architecture
### v1 · companion to fabricxai-backend-dev-plan.md and CLAUDE.md

---

## 1. Architecture at a glance

**Style:** modular monolith. One deployable app (Next.js 16) + one worker process, sharing one Postgres. Module boundaries are enforced by folder contract, lint rules, and review — not by network hops. This is a deliberate choice for a small team: microservices would multiply operational surface without adding capability at this scale, while the module contract keeps a future extraction (e.g. splitting the worker or MARBIM into services) cheap because boundaries already exist in code.

**The five load-bearing decisions:**
1. **Propose → approve → commit.** No AI or junior write touches business tables directly; everything flows through `pending_changes` with per-module Zod validation and role-routed approval. This is an architectural layer, not a feature.
2. **Two-wall tenancy.** Application-layer scoping (`ctx.companyId` through every service call) *and* Postgres RLS keyed on a per-transaction session variable. Either wall alone stops a bug; both together stop a bug plus a bypass.
3. **Server-side gates.** Business preconditions (PP approval before cutting, UD balance on bonded issues, BTB headroom on import POs, EXP before bank submission, LC latest-shipment conflicts) live in the service layer and return structured errors. UI reflects gates; it never implements them.
4. **Outbox-driven async.** Events are written in the same transaction as the data change, then relayed to BullMQ. No dual-write problem, at-least-once delivery, idempotent handlers.
5. **Reads are shaped by screens.** `queries.ts` per module implements exactly the read models the locked designs need (HANDOFF §3) — no generic "get everything" endpoints, which is what keeps a 15-concurrent-order factory fast on VPS hardware.

---

## 2. Runtime topology

```
                    ┌────────────────────── VPS (Ubuntu 24, Docker Compose) ─────────────────────┐
 Desk browsers ──┐  │  ┌───────┐   ┌──────────────────────────┐    ┌──────────────────────────┐  │
 Floor tablets ──┼──┼─▶│ Caddy │──▶│ app: Next.js 16          │    │ worker: BullMQ processors │  │
 Owner phone  ───┘  │  │ (TLS) │   │  server actions / routes │    │  extraction, digests,     │  │
                    │  └───────┘   │  modules/* service layer │    │  PDF render, schedulers   │  │
                    │              └─────┬────────┬───────┬───┘    └───┬─────────┬─────────┬───┘  │
                    │                    │        │       │            │         │         │      │
                    │              ┌─────▼──┐ ┌───▼───┐ ┌─▼─────┐ ┌────▼────┐    │    ┌────▼───┐  │
                    │              │PgBounce│ │ Redis │ │ MinIO │ │PgBouncer│    │    │ MinIO  │  │
                    │              └─────┬──┘ └───────┘ └───────┘ └────┬────┘    │    └────────┘  │
                    │              ┌─────▼──────────────────────────────▼─────┐  │                │
                    │              │ PostgreSQL 16  (RLS, pgvector, pg_trgm,  │  │                │
                    │              │  partitioned hourly_outputs, outbox)     │  │                │
                    │              └──────────────────────┬───────────────────┘  │                │
                    │                          pgBackRest │ WAL + snapshots      │                │
                    └──────────────────────────────────────┼─────────────────────┼────────────────┘
                                                           ▼                     ▼
                                              Offsite R2/B2 backups     Anthropic · Gemini · OpenAI
                                                                        Resend/SES · Sentry
```

Processes: **app** (stateless, horizontally scalable later), **worker** (stateless consumers; concurrency per queue), Caddy, PgBouncer (transaction mode), Postgres, Redis, MinIO. Everything in one compose file; dev and prod share the same shape (dev adds Mailpit, drops Caddy/backups).

---

## 3. Layers inside the app

```
HTTP boundary        app/actions/* , app/api/*        parse → auth → zod → call service → map errors
                     │  (thin: no business logic, no db access — lint-enforced)
Service layer        modules/<m>/service.ts           ALL business logic; state machines; gates;
                     │                                 pure functions for computable logic
Read models          modules/<m>/queries.ts           screen-shaped reads (HANDOFF §3), pagination,
                     │                                 covering-index-aware
Data access          drizzle + core repo helpers      auto tenant-scoped; RLS session var set per tx
Cross-cutting core   modules/core                     tenancy ctx, pending_changes, audit interceptor,
                                                      outbox, state-machine + gate helpers, Money,
                                                      documents (S3), notifications, offline sync
```

**Request lifecycles, the four that matter:**

*Interactive write* (e.g. actualize a milestone): action → ctx from session → zod → `service.actualizeMilestone` → tx { SET app.company_id; write; recompute critical path; outbox event } → typed result with ripple summary. p95 target < 300ms.

*Offline batch* (floor): device queue → `POST /api/sync` with `offline_key`s → per-row upsert (unique keys make replays no-ops) → per-row results → device reconciles. Designed for burst: 50 lines submitting within the same minute.

*AI extraction* (async by design): upload → document stored (MinIO) → `extract` job enqueued (per-company rate limit) → worker calls model (Gemini default; escalation rule) → per-field confidence draft → `pending_changes` insert (validated) → notification. The request that started it returned immediately with a job id; the UI polls/receives the draft. Failures are job states — retryable, never silent.

*Scheduled derivation* (nightly/hourly): schedulers enqueue → TNA risk scan, WIP snapshots, efficiency day-close, supplier scores, exceptions-feed materialization, digests. All read-compute-write with idempotent upserts on derived tables.

---

## 4. Data architecture

- **Schema organization:** one drizzle file per module re-exported centrally; every tenant table carries `company_id` + standard audit columns. One writer module per table (shared reads go through the owner's queries).
- **Hot-table strategy:** `hourly_outputs` (and later `inline_checks`) partitioned by month from the first migration; covering indexes derived from HANDOFF §3 sort/filter specs, reviewed in the migration read-through gate.
- **Derived tables** (`efficiency_daily`, `dhu_daily`, `wip_snapshots`, `supplier_scores`, `order_costs_actual`, `exceptions_feed`) are written only by jobs — never by request paths — and are safe to rebuild from source at any time (rebuild scripts live with the jobs).
- **Reservation semantics:** stock, line-days, UD balance, and BTB headroom all expose on-hand / reserved / free as first-class computed reads, because multi-order contention is the normal state. Reservation writes take row-level locks inside short transactions; free = on_hand − Σ(open reservations) is computed, not stored.
- **Vector store:** pgvector in the same Postgres — `style_fingerprints` (HNSW index) for Order Memory similarity; embeddings written by queued jobs. Same-database keeps joins to outcomes trivial; revisit only if vector volume ever dwarfs relational load (unlikely here).
- **Search:** Postgres FTS + pg_trgm (buyers, styles, workers, rolls). No external search engine in v1.
- **Money:** `numeric(14,2)` + currency; arithmetic in the Money lib only.

---

## 5. Async & jobs (worker)

Queues (BullMQ, Redis): `extract` (AI, per-company limited), `render-pdf` (Playwright chromium pool), `notify`, `derive` (snapshots/scores/day-close), `schedule` (TNA scan, LC countdowns, PM due, certificate ladder), `outbox-relay`, `email`, `export`.

Rules: handlers idempotent (event-id dedupe table); retries with backoff + dead-letter list surfaced in an admin runbook screen; the outbox relay is the only bridge from transactions to queues; job heartbeat feeds Uptime Kuma. The worker is where all model calls, all PDF rendering, and all digest assembly happen — the app process never blocks on any of them.

---

## 6. MARBIM subsystem

- **Model registry** (task-type → model tier; see PLAYBOOK §6a) — modules never name models.
- **Tool packs:** each module registers read tools + draft tools; the agent route composes the caller's pack from their role + current module context. Draft tools can only emit `pending_changes` payloads — the type system makes direct writes inexpressible.
- **Extraction pipeline:** classify (small model: which module does this document belong to?) → extract (structured, per-field confidence from the extraction method) → low-confidence single escalation to the higher tier → draft insert. Correction telemetry (field-level edits at approve time) is logged per extractor version — the feedback loop that justifies "94%" ever being shown to a user.
- **Chat:** streaming route in the app (the one latency-sensitive AI path), tools executed under the caller's ctx so RLS bounds every tool read. Rate-limited per user + company.

---

## 7. Security architecture

- **AuthN:** Better Auth (email+password, verification, session cookies httpOnly/secure); organization plugin binds users→companies→roles into the ctx.
- **AuthZ:** role checks at the action boundary; approval_rules for pending commits; payroll endpoints additionally hard-gated (hr/owner) with bodyless 403s and audited reads.
- **Tenancy:** the two walls (§1.2). CI carries a permanent cross-tenant test.
- **Input:** Zod at every boundary (actions, sync batch, pending payloads at insert *and* approve, env at boot).
- **Files:** mime/size validation, unguessable S3 keys, private buckets, signed URLs.
- **Transport/edge:** Caddy TLS, security headers, CSRF per Better Auth, rate limits (auth, AI, sync) in Redis.
- **Audit:** append-only audit_log via the core interceptor on ⚖ tables; approve chains fully traceable draft→reviewer→committed row.
- **Ops:** ufw allowlist, fail2ban, unattended upgrades, secrets via env only, backup encryption at rest offsite.

---

## 8. Scaling ladder (what breaks first, in order, and the pre-planned answer)

1. **PG connections** under route concurrency → already solved day one (PgBouncer transaction mode).
2. **Dashboard read load** (owner + managers polling) → Redis-cached aggregates with event-driven invalidation (built in Phase 9); exceptions feed is materialized, not computed per request.
3. **hourly_outputs growth** → monthly partitions + partition pruning (day one); archive partitions older than 24 months to cold storage when needed.
4. **Extraction throughput** → raise worker concurrency; queues already isolate it from interactive traffic.
5. **App CPU** → `docker compose scale app=2` behind Caddy — the app is stateless; sessions in cookies/Redis.
6. **Single-VPS ceiling / HA** → the first real re-architecture: managed or replicated Postgres (streaming replica + failover), app+worker on a second node. Trigger: first paying factory whose operations would halt on VPS loss. Everything above is compose-portable by design.
7. **Multi-region / very large fleet** → out of scope for this document; the module boundaries and S3/Postgres/OIDC-standard seams are the insurance policy.

---

## 9. Failure modes & designed behavior

| Failure | Designed behavior |
|---|---|
| Internet drop on floor | Client queues with offline_keys; sync replays are no-ops; banner tells the truth |
| AI provider down/limited | Jobs retry with backoff; drafts arrive late, never lost; chat degrades with honest error |
| Worker crash | BullMQ redelivers; idempotent handlers make replays safe; heartbeat alarm fires |
| App crash mid-transaction | Postgres rolls back atomically; outbox event never emitted without the data change |
| Bad migration deployed | Forward-fix only policy; migrate-check in CI catches drift; backups + WAL for the worst case |
| VPS loss | pgBackRest offsite restore, drilled: RTO ≤ 4h, RPO ≤ 15min |
| Approve raced twice | Status-guard idempotency: second approve gets 409, one commit ever happens |
| UD/BTB concurrent overdraw attempt | Row-lock inside the gate check transaction; second writer blocks then fails the gate |

---

## 10. What this architecture is optimized for — stated plainly

A 2,000-worker factory's full operation on one affordable VPS, entered largely by non-technical staff on shared devices over unreliable networks, with an AI layer a skeptical owner can audit line by line, built and maintained by a very small team using Claude Code against enforced contracts. Every choice above — monolith, outbox over Kafka, Postgres for everything including vectors and search, screens-shape-the-reads — follows from that sentence. When the constraint changes (a fleet of factories, HA requirements), the seams to re-architect are already named in §8.
