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
[`docs/runbooks/phase-0-exit.md`](./runbooks/phase-0-exit.md). Current: **4/4 green — Phase 0 complete**, CI green on `main`. Next is Phase 2 (X.1 Approve Inbox + X.2 MARBIM),
which cannot start until `docs/handoffs/HANDOFF-X.1.md` exists with §8 resolved.

## Modules
| Module | Design locked | HANDOFF §8 empty | Backend merged | Frontend merged | k6 | In pilot use |
|---|---|---|---|---|---|---|
| X.1 approve-inbox | | | | | — | |
| X.2 marbim | | | | | | |
| 1.3 order-desk-tna | ⬜ handoff pending | — | 🟡 backend-first: schema, zod, TNA engine, service, events, scheduled jobs, applyRevision loop, register. queries.ts + actions.ts await HANDOFF §3/§5 | | | |
| 2.2 bonded-warehouse-ud | ⬜ handoff pending | — | 🟡 backend-first: schema, zod, UD gate + concurrency, service, events, jobs, register | | | |
| 3.1 store | | | | | | |
| 6.1 line-tracking | | | | | ⚡ req | |
(…add all 23 from 02-backend/briefs/README.md)
