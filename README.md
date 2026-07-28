# FabricXAI

AI-powered ERP for Bangladeshi garment export factories. Modular monolith: Next.js 16
(app router, server actions) + Drizzle + PostgreSQL 16 + Redis/BullMQ + MinIO + Better Auth.

Repo rules live in [`CLAUDE.md`](./CLAUDE.md). Architecture in
[`docs/02-backend/fabricxai-backend-architecture.md`](./docs/02-backend/fabricxai-backend-architecture.md).
The build is driven by [`docs/02-backend/PLAYBOOK.md`](./docs/02-backend/PLAYBOOK.md) — read it
before starting a module.

## Getting started

```bash
cp .env.example .env          # defaults already match docker-compose.dev.yml
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm dev                      # http://localhost:3000
pnpm worker:dev               # separate terminal
```

Check `http://localhost:3000/api/health` — it exercises Postgres through PgBouncer and
Redis, so a green result means the real paths work, not just the process.

## Local services

| Service | Host port | Notes |
|---|---|---|
| PgBouncer (`DATABASE_URL`) | 6432 | transaction mode — all app traffic |
| Postgres (`DIRECT_DATABASE_URL`) | 5433 | migrations only; pgvector, pg_trgm, btree_gin |
| Redis | 6379 | BullMQ, rate limits, cached aggregates |
| MinIO | 9000 (API) / 9001 (console) | `fabricxai` / `fabricxai-dev-secret` |
| Mailpit | 1025 (SMTP) / 8025 (UI) | Better Auth verification mail lands here |

`docker compose -f docker-compose.dev.yml --profile full up -d` additionally runs the app
and worker in containers.

## Commands

| Command | What |
|---|---|
| `pnpm dev` / `pnpm worker:dev` | app / BullMQ worker |
| `pnpm db:generate` / `pnpm db:migrate` | drizzle-kit generate / apply (DIRECT_DATABASE_URL) |
| `pnpm db:generate:custom` | hand-written SQL migration (RLS, partitions, backfills) |
| `pnpm test` / `pnpm test:integration` | vitest / + testcontainers |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm seed` | factory-scale seed (also feeds k6 and demos) |
| `pnpm verify:phase0` | run the Phase 0 exit gates — see `docs/runbooks/phase-0-exit.md` |

## Layout

```
src/
  app/          Next routes — thin: parse → auth → zod → service
  modules/      THE backend, one folder per module id (see src/modules/README.md)
    core/       tenancy, pending_changes, audit, outbox, documents, notifications, registry
  db/           drizzle schema, migrations, seed
  worker/       BullMQ processors
  lib/          money, ids, env, redis, s3, dates, i18n, pdf
```

## Two things that are easy to get wrong

**Migrations never go through PgBouncer.** `DATABASE_URL` points at the pooler and
`DIRECT_DATABASE_URL` at Postgres. DDL and the migration advisory lock do not survive
transaction pooling. Applied migrations are immutable — forward-fix only.

**Money is never a float.** Amounts are decimal strings backed by `numeric(14,2)` and every
amount carries its currency. Use `lib/money`; `parseFloat`/`Number()` on a money value is
banned.

## Status

Phase 0, session 1 of 4 complete — see `docs/PROGRESS.md`. No business modules yet; each
one starts only when its `docs/handoffs/HANDOFF-<id>.md` exists with §8 empty. Outstanding
foundation gaps are tracked in `docs/STUBS.md`.
