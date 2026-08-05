# PROGRESS — module tracker

## Phase 0 — foundation (PLAYBOOK §1)
| Session | Scope | Status |
|---|---|---|
| 1 | Repo scaffold: Next 16 tree, compose (pg16+pgvector/pg_trgm/btree_gin, pgbouncer, redis, minio, mailpit), Zod env at boot, Drizzle + `core.ts` + migrations 0000–0002 (incl. RLS policies), theme.css + brand | ✅ 2026-07-29 |
| 2 | Better Auth: email+password, verification via Mailpit, organization plugin → companies/roles → `ctx` | ✅ 2026-07-29 |
| 3a | Trust spine: `withTenantTx` + non-owner app role, audit interceptor, outbox `emit`, pending_changes v2 | ✅ 2026-07-29 |
| 3b | MinIO documents, notifications, offline sync, outbox relay worker, module-aware seed generator | ✅ 2026-07-29 |
| 4 | CI: lint (incl. `no-float-money`, `analytics-no-writes`), typecheck, vitest, migrate-check, docker build | ✅ 2026-07-29 |

**Phase 0 exit criteria (greenfield):** signup→verify→login works locally; a demo
pending_change inserts, approves, commits and audits end-to-end against a scratch table;
`seed --scale=pilot` runs; CI green.

Each criterion has a named proof artifact and a runner — `pnpm verify:phase0`, defined in
[`docs/runbooks/phase-0-exit.md`](./runbooks/phase-0-exit.md). Current: **4/4 green — Phase 0 complete**, CI green on `main`.

> **The Phase-2 precondition was not met, and Phase 2 shipped anyway.** This section used to
> say X.1 and X.2 "cannot start until `docs/handoffs/HANDOFF-X.1.md` exists with §8 resolved".
> That file still does not exist; X.1 shipped 887 LOC of backend and 833 of UI, X.2 shipped its
> whole provider seam. The rule was bypassed rather than satisfied, which is the honest way to
> read every `⬜ pending` in the table below (audit PROC-1 / BE-B7).

## Modules

Backend legend: **✅** merged · **🟡** merged backend-first (built against the brief, no HANDOFF).
Frontend legend: **✅** screens complete vs the build pack · **◐** partial (screens missing —
see `docs/DEPLOYMENT-READINESS-AUDIT.md` §3) · **○** read-only (no write surface reaches it).
Tests: **T** tenancy (cross-company ⇒ 0 rows) · **M** state machine 409 · **P** pending flow ·
**O** offline replay. i18n: **bn** = floor screens read Bangla.

| Module | HANDOFF §8 | Backend | Frontend | Tests | k6 | Notes / owed |
|---|---|---|---|---|---|---|
| X.1 approve-inbox | ⬜ pending | 🟡 887 LOC, live UI | ✅ J/K/A/R, diff, reject reason | ⚠ **none** | — | **No tests and no `register.ts`** — absent from `modules/registry.ts`, so no primer/targets (audit TEST-B1, BE-B7) |
| X.2 marbim | ⬜ pending | 🟡 provider seam, extraction, telemetry | ◐ surface + intake | T·P | — | **No real provider; tools cannot execute; nine modules hardcode confidence** (AI-B1/B2/B3) |
| X.3 settings-admin | ⬜ pending | 🟡 policies, profile, toggles | ◐ 1 page | T | — | Users/roles matrix, module toggles, master data, export, audit log, locale picker all absent (FE-S14). No `queries.ts` |
| 1.1 buyer-lead-desk | ⬜ pending | 🟡 leads, stages, convert | ○ read-only board | T·M·P | — | `moveLeadStage`/`convertLeadToBuyer` have **zero UI callers** (FE-B4) |
| 1.2 rfq-quotation | ⬜ pending | 🟡 RFQ, quotes, win/loss | ○ read-only list | T·M | — | **No `actions.ts`** — no quote entry from the UI (FE-S2) |
| 1.3 order-desk-tna ⭐ | ⬜ pending | 🟡 TNA engine, applyRevision | ○ read-only | T·M·P | — | **No `actions.ts`; a merchandiser cannot tick a milestone** (FE-B2). No TNA calendar, no revision upload |
| 1.4 sampling | ⬜ pending | 🟡 stages, feedback, PP gate | ✅ board, detail, library | T | — | Machine 409 unasserted; **2 sync handlers with no replay test** (TEST-H6) |
| 1.5 costing-studio | ⬜ pending | 🟡 BOM, versioned sheets, margin floor | ◐ BOM + sheet | T·M | — | FOB now exact (BE-B3). Est-vs-actual waterfall + template library missing |
| 1.6 order-memory | ⬜ pending | 🟡 pgvector fingerprints, outcome compiler | ◐ own page | T·P | — | Similar-orders panel **not embedded** in RFQ/BOM as the pack requires (FE-S5). HNSW under-returns for small tenants (DB-M7) |
| 2.1 lc-register ⚖ | ⬜ pending | 🟡 LC, BTB, amendments, bank docs | ✅ register, detail, submissions | T·M·P | — | `lcs` **not audited on create**; `lcs.status` never leaves `active`; **latest-shipment gate never enforced** (BE-B5/M2/H2) |
| 2.2 bonded-warehouse-ud ⚖ | ⬜ pending | 🟡 UD gate + concurrency | ✅ register, detail, blocked-issue | T·P | — | UD compares now exact (BE-B3). `uds.status` set by raw update, no machine (BE-M1) |
| 3.1 store | ⬜ pending | 🟡 stock math, GRN, issue w/ UD draw | ✅ 4 screens · **bn** | T·O | ⚠ none | `store/rolls` is action-only **by design** (it proposes a pending change; nothing to replay) — documented in `store/actions.ts` |
| 3.2 procurement | ⬜ pending | 🟡 PR, quotes, PO, scorecard | ◐ 4 screens | T·M | — | Quote matrix + PI-vs-PO card missing (FE-S6) |
| 4.1 capacity-planning | ⬜ pending | 🟡 allocation, capacity | ○ read-only board | T·M·P | — | **No `actions.ts`**; no drag, no what-if, no plan-vs-actual (FE-S7) |
| 5.1 cutting-floor | ⬜ pending | 🟡 lay, bundles, wastage | ✅ 4 screens · **bn** | T·O | ⚠ none | Bundle machine is exercised but the refusal is asserted as a bare throw, not a typed 409 (TEST-H7) |
| 6.1 line-tracking ⚡ | ⬜ pending | 🟡 partitioned hourly, downtime, day-close | ◐ hourly, endline, board · **bn** | T·O | ⚠ **written, never run** | **No HTTP routes** — k6 targets `/api/production/*` which do not exist (TEST-B2). Partition repair path is broken (DB-H3) |
| 7.1 quality | ⬜ pending | 🟡 inline, final, AQL, measurements | ✅ 5 screens · **bn** | T·M·O | — | `quality/final` + `measurements` bypass offline sync with **no stated reason**; measurements writes per-piece with no offline key, so a dropped connection loses the set and a retry double-writes (FE-H5). `fabric` is action-only by design. AQL level unconstrained (DB-M9) |
| 8.1 shipment ⚖ | ⬜ pending | 🟡 cartons, packing, EXP, ex-factory | ◐ 2 screens | T·O | — | Port machine exercised as a bare throw, `packingListMachine` not at all (TEST-H7). **EXP gate is bypassable** via commercial's `createSubmission`, which opens a bank presentation with no EXP check. Review desk + B/L card missing (FE-S9) |
| 9.1 machines-tickets | ⬜ pending | 🟡 auto-ticket from downtime, PM, spares | ◐ 3 screens | T·M | — | Machine detail drawer + nameplate draft missing (FE-S10) |
| 10.1 workforce-payroll 🔒 | ⬜ pending | 🟡 gazette upload, pure compute, lockout | ◐ 1 page | T·M | — | **Never parallel-run against a real payroll.** Attendance queue + payslip missing (FE-S11) |
| 10.2 compliance-audit ⚖ | ⬜ pending | 🟡 findings batch, CAP, expiry ladder | ◐ 1 page | T·M·P | — | Audit detail route missing (FE-S12) |
| 11.1 commercial-finance ⚖ | ⬜ pending | 🟡 cash timeline, profitability, aging | ✅ 3 sections | T | — | No machine on `receivables`/`payables` status (BE-M1); `Money` type unadopted here (BE-M8) |
| 11.2 owner-dashboard ⚡ | ⬜ pending | 🟡 read-only by lint, ratios, exceptions | ◐ 1 page | T | ⚠ **none** | No sparklines (no chart lib), no MARBIM ask bar, no phone variant (FE-S13) |

**Reading this table:** every module says `⬜ handoff pending`. That is not a formality —
`docs/handoffs/` is empty, so no module has a FINAL contract to verify §5 operations, §6
machines, §7 gates or §9 NFRs against, and "backend merged" means "merged against the brief"
(audit PROC-1 / BE-B7).

Not started at all: the Marketing Site, LinkedIn Catalog and Social Brand Kit canvases.

## Deployment readiness

A full-stack audit ran on 2026-08-03 — 153 findings, tracked with commit hashes in
[`docs/DEPLOYMENT-READINESS-AUDIT.md`](./DEPLOYMENT-READINESS-AUDIT.md). Sprints 1–4 landed:
the crash-and-data-loss class, tenancy hardening, production infrastructure (prod compose,
Caddy, pgBouncer scram, rate limits, pino + Sentry) and the floor's Bangla.

**A re-verification pass on 2026-08-05 checked those claims against the code** and found
three of the shipped infrastructure fixes do not work as written, plus two authorization gaps
the first audit never looked for. The ordered backlog is
[`docs/PRODUCTION-READINESS-PLAN.md`](./PRODUCTION-READINESS-PLAN.md); the verdict was **not
ready for real factory data**, with a floor-first pilot reachable. The headlines:

- **Documents cannot upload or download in production** — Caddy's `handle_path /s3/*` strips
  the very prefix SigV4 signed, so every presigned URL returns 403.
- **There are no backups** — `scripts/backup.sh` and all six restore paths invoke a `backup`
  compose service that does not exist, and `archive_command=true` discards WAL. The restore
  rehearsal log is still empty, and today it could not be filled.
- **Server actions have no role check** (plan 1.1) and **five auth tables have no RLS**
  (plan 1.2). See `docs/STUBS.md`.
- **`MARBIM_ENABLED=false` does not turn MARBIM off** (plan 6.1).

Phase 0 of the plan is complete: the tree is committed, the shell's route gate fails closed,
three service files are no longer binary to grep, and `pnpm seed` refuses a production or
remote target.
