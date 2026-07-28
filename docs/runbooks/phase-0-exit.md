# Runbook — Phase 0 exit criteria

> **Exit criteria (greenfield, PLAYBOOK §1):** signup→verify→login works locally; a demo
> pending_change inserts, approves, commits, and audits end-to-end against a scratch
> table; `seed --scale=pilot` runs; CI green.

Four gates. Each one names the **artifact that proves it** — a test file or a workflow,
not a person clicking around. Anything verified only by clicking is verified once and
then silently rots.

Run everything that currently exists:

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm verify:phase0
```

The runner executes each gate whose artifact exists and reports `BLOCKED` with the
owning session for the rest, so the same command is the honest status report all the way
through Phase 0.

| Gate | Proof artifact | Status | Unblocked by |
|---|---|---|---|
| A · signup→verify→login | `src/modules/core/__tests__/auth-flow.integration.test.ts` | ✅ passing (8 assertions) | session 2 — done |
| B · pending_change end-to-end | `src/modules/core/__tests__/pending-flow.integration.test.ts` | ✅ passing (11 cases) | session 3a — done |
| C · `seed --scale=pilot` | `pnpm seed --scale=pilot` exit 0, twice | ✅ passing | session 3b — done |
| D · CI green | `.github/workflows/ci.yml` | ✅ all jobs defined; green locally | session 4 — done |

---

## Gate A — signup → verify → login

**Artifact:** `src/modules/core/__tests__/auth-flow.integration.test.ts`

API-level, no browser. Playwright is a Phase 4 tool (dev-plan §7) and adds nothing here:
what is under test is Better Auth plus real SMTP delivery, not a UI. A browser would make
this gate slower and flakier while proving strictly less.

The verification email is fetched from Mailpit's REST API, so nothing here needs a human:

```
GET  http://localhost:8025/api/v1/messages?limit=10   → { total, messages: [{ ID, To, Subject }] }
GET  http://localhost:8025/api/v1/message/{ID}        → { Text, HTML }   ← extract the link
DELETE http://localhost:8025/api/v1/messages          → reset between tests
```

**Sequence**

1. `POST /api/auth/sign-up/email` → 200; `users` row exists with `email_verified = false`
2. Sign-in **before** verifying → refused (this is the half of the flow that actually
   matters; a verification step that does not gate login is decoration)
3. Poll Mailpit for the message addressed to that user; extract the verification URL
4. Follow it → `users.email_verified = true`
5. `POST /api/auth/sign-in/email` → 200 + `Set-Cookie` session cookie, `httpOnly` + `secure`
6. Protected route **with** the cookie → 200; **without** it → 401
7. The organization plugin produced a `companies` row and a `roles` row, and `ctx`
   resolves to `{companyId, userId, roles}` — this is the part every later module depends
   on, and it is the part a manual click-through never actually checks
8. Garbage / already-consumed verification token → refused

Route paths confirmed as built: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`,
`GET /api/auth/verify-email?token=…`, and `GET /api/me` for the ctx assertion.

**Cleanup:** delete the Mailpit messages and the test user, so the gate is re-runnable.
`afterAll` runs on failure too — a failed run leaves no rows behind.

**Verified it can fail.** Flipping `requireEmailVerification` to `false` in
`src/lib/auth.ts` makes cases 2 and 3 fail, and case 3 catches a live session row being
minted from an unverified account. A gate that has never been seen red is not a gate.

---

## Gate B — demo pending_change inserts → approves → commits → audits

**Artifact:** `src/modules/core/__tests__/pending-flow.integration.test.ts`

**The scratch table is created in the test's setup, never in a migration.** A demo table
that ships in `src/db/migrations/` reaches production, and "it was only for the Phase 0
gate" is not a story anyone wants to tell later. The test creates `demo_widgets` in
`beforeAll` — with RLS enabled, forced, and the same tenant policy every real table gets,
or it would prove nothing about tenancy — and registers a throwaway module:

```ts
registerModule({
  id: '__demo__',
  pendingTargets: ['demo_widgets'],
  zodMap: { widget_v1: demoWidgetSchema },
  approvalDefaults: { requiredRoles: ['owner'] },
})
```

**Assertions** — this is the chain a skeptical owner is being asked to trust, so the gate
tests the refusals as hard as the happy path:

| # | Case | Expected |
|---|---|---|
| 1 | `propose()` with real per-field confidence | row in `pending_changes`, status `pending`, `field_confidence` non-empty, `confidence_min` set |
| 2 | `propose()` targeting an **unregistered** table | rejected — CLAUDE.md rule 3 |
| 3 | `propose()` with a payload the module zod rejects | 422, no row written |
| 4 | `approve()` | in **one** transaction: target row written · status `committed` · `committed_row_id` set · `audit_log` row with before/after and `pending_change_id` · `outbox` row `approve.committed` |
| 5 | `approve()` **again** | 409, and still exactly one `demo_widgets` row (architecture §9) |
| 6 | `approve()` after the module zod has **tightened** | fails with the schema error, commits nothing (PLAYBOOK §3 — the X.1 re-validation test, in embryo) |
| 7 | `reject()` | status `rejected`, no target row, audit row written |
| 8 | `approve()` the same draft scoped to **company B** | not found / forbidden, zero rows |
| 9 | `approval_rules` with `min_confidence` above the draft's `confidence_min` | does **not** auto-approve |

Cases 5, 6 and 8 are the ones worth the effort. 1 and 4 only prove the feature works;
those three prove it cannot be talked around.

**Verified it can fail.** Replacing the approve-time re-validation with the stored payload
makes case 6 pass a draft that a tightened schema should reject; removing the status guard
makes case 5 commit twice. Both were injected and observed red before being restored.

The test runs against the local compose Postgres. Its **fixture** connects as the owner
(superuser), which bypasses RLS — that is what a fixture needs. The **code under test**
connects as `fabricxai_app_rw`, which does not, so case 8 is a real RLS result rather than
an application-level check. Moving the fixture to Testcontainers is a session 4 concern.

---

## Gate C — `seed --scale=pilot` runs

**Artifact:** `pnpm seed --scale=pilot` exits 0, run **twice in a row** (re-runnable, or
it is useless for demos and k6), followed by row-count assertions.

**Resolve this ambiguity before building the generator.** dev-plan §7 describes the seed
in full-system terms — 250 orders, 1.2M `hourly_outputs`, 30k rolls, 2,400 workers, plus
the deliberate edge rows (LC latest-shipment conflict, overdrawn UD attempt, a 38% line, a
negative-margin order). Every one of those tables belongs to a module that does not exist
until Phase 3–8. At Phase 0, `--scale=pilot` can only populate core: one company, users
across the role matrix, profiles, roles, `approval_rules`, a few documents and
notifications, and `pending_changes` in each status.

**Built module-aware**, per the recommendation above: `src/db/seed/types.ts` defines a
`SeedSlice`, `core-slice.ts` is the only one so far, and `--scale` controls volume only.
A module adds its slice; this file is never edited again.

Idempotency is the property under test — fixed company uuid, deterministic ids,
`onConflictDoUpdate`/`onConflictDoNothing` throughout, and a deterministic RNG so a seeded
database is reproducible ("it only fails with the demo data" is not debuggable when the
demo data differs every run). Verified: two consecutive runs, row counts unchanged.

Also assert, cheaply: seeded rows are visible **only** under the matching
`app.company_id`. It costs three lines and smoke-tests wall 2 on every seed run.

---

## Gate D — CI green

**Artifact:** `.github/workflows/ci.yml`, all jobs green on a pull request.
Remote: `github.com/fabricxai/fabricxai-final`.

| Job | Command | Works today |
|---|---|---|
| lint | `pnpm lint` + both custom rules | ✅ |
| typecheck | `pnpm typecheck` | ✅ |
| unit | `pnpm test` | ✅ 14 tests |
| integration | `pnpm test:integration` | ✅ 28 tests across gates A + B + core services; starts its own `next dev` on an exclusive port |
| migrate-check | see below | ✅ both halves verified |
| docker build | `docker build .` | ✅ image built, run non-root against the live stack, healthcheck green |

**The two custom lint rules are the ones that matter**, because they are the only
enforcement behind two CLAUDE.md rules that are otherwise honour-system:

- `no-float-money` — bans `parseFloat`/`parseInt` outright, and `Number()`/arithmetic/unary
  `+` on any value whose NAME reads as money (rule 4). Deliberately a name heuristic rather
  than typed linting: a blunt "ban Number() everywhere" fires on confidence scores and row
  counts, gets disabled reflexively, and then catches nothing. False negatives accepted,
  false positives not.
- `analytics-no-writes` — bans `.insert()/.update()/.delete()`, importing the write side of
  core, and importing another module's `service.ts` inside `src/modules/analytics`
  (rules 9 and 11).

Both have RuleTester unit tests covering what they must NOT fire on as well as what they
must, and both were confirmed firing on deliberately planted violations in real project
files. A lint rule never seen red is decoration.

**migrate-check is two separate things**, and only the first is obvious:

```bash
pnpm exec drizzle-kit check      # migration chain consistency → "Everything's fine 🐶🔥"
pnpm exec drizzle-kit generate && git diff --exit-code src/db/migrations
                                 # drift: schema edited, migration forgotten
```

The second is the one that catches real mistakes. With no schema change, `generate` prints
`No schema changes, nothing to migrate` and writes no file, so a clean `git diff` means
schema and migrations agree. Without it, a `schema.ts` edit with no generated migration
sails through CI and fails on deploy.

Add a third job that applies **all** migrations to an empty Postgres service container —
that is what proves a fresh production database can be provisioned from zero, and it is
why extensions live in `0000_extensions.sql` rather than only in the compose init hook.

---

## Recording the result

Phase 0 closes when `pnpm verify:phase0` reports four green gates and CI is green on a PR.
Tick the sessions in `docs/PROGRESS.md`; anything deliberately deferred goes in
`docs/STUBS.md` with the phase that owes the replacement.
