# FabricXAI — Backend Implementation PLAYBOOK

The operating manual for building the backend with Claude Code. The dev plan (`fabricxai-backend-dev-plan.md`) says *what* and *when*; this says *how, step by step, every time*. Follow it mechanically — the value is in never skipping a step.

---

## 0. The three artifacts every module build needs

1. `briefs/<id>.md` — the module's self-contained backend brief (this folder)
2. `docs/handoffs/HANDOFF-<id>.md` — filled from the locked Claude Design output, §8 empty
3. `CLAUDE.md` — repo rules (committed at root; Claude Code reads it automatically)

No handoff → no build. The only exceptions are Phase 0 (foundation) and Phase 1 (migration), which have no screens.

---

## 1. One-time setup (Phase 0, GREENFIELD) — run once

No prior codebase, no Supabase. Session 1 with Claude Code, kickoff prompt:

```
Read CLAUDE.md, docs/02-backend/fabricxai-backend-architecture.md §2–§3,
and docs/02-backend/fabricxai-backend-dev-plan.md §1–§3.
Task: scaffold the FabricXAI repo from scratch.
1. Next.js 16 (app router, TS strict) with the modular-monolith layout in
   architecture §2.1 — create the folder skeleton for modules/core and
   empty module folders per the contract; src/worker for BullMQ.
2. docker-compose.dev.yml: postgres16 (+pgvector, pg_trgm, btree_gin),
   pgbouncer, redis, minio, mailpit. .env.example with the Zod-validated
   key list from dev-plan §3; env validation at boot.
3. Drizzle wired (DATABASE_URL via pgbouncer, DIRECT_DATABASE_URL for
   migrations). Create db/schema/core.ts: companies, users (Better Auth
   tables come next session), profiles, roles, documents, audit_log,
   outbox, pending_changes v2 (whitelisted target_table, zod-map hook,
   field_confidence jsonb, approval_rules), plus the notifications table.
   Generate the initial migration.
4. Install theme-v2.css as src/app/theme.css; logo assets to public/brand.
Stop and show me: the tree, the migration SQL, and a passing `pnpm dev`
+ compose boot. No business modules yet.
```

Sessions 2–4: Better Auth (email verify via mailpit; organization plugin →
companies/roles → ctx) → modules/core services (tenancy wrapper + RLS session
var, audit interceptor, outbox relay + worker skeleton, MinIO documents,
offline sync endpoint, Money lib, state-machine + gate helpers, MARBIM_MOCK
fixture mode) → CI (lint incl. no-float-money + analytics-no-writes,
typecheck, vitest + testcontainers, migrate-check, docker build).

**Phase 0 exit criteria (greenfield):** signup→verify→login works locally;
a demo pending_change inserts, approves, commits, and audits end-to-end
against a scratch table; seed --scale=pilot runs; CI green.

**There is no Phase 1.** The first real module is X.1+X.2 (Phase 2), then
1.3. RFQ (1.2) is built fresh in Phase 5 through the normal loop — its brief's
"Wave 1 exists" notes are historical; treat every delta as a build item.

---

## 2. The per-module loop — the heart of this playbook

Repeat for every module, in the dev-plan phase order. Budget: small module ≈ 2–4 Claude Code sessions; flagship (1.3, 6.1, 10.1) ≈ 6–10.

### Step A — Preflight (you, 15 min)
- [ ] HANDOFF-<id>.md committed, §8 empty, reviewed by one FE + one BE person
- [ ] Read the brief's **Entities** against handoff §4 deltas — mark any conflict; if invariants are touched (tenancy, money, gates, audit), the brief wins and the handoff gets corrected first
- [ ] Confirm cross-module dependencies from handoff §7 already exist (e.g. 5.1 needs the PP gate event from 1.4; 3.1 needs `checkUdBalance` from 2.2 — stub it per §7 if its module comes later, and log the stub in `docs/STUBS.md`)

### Step B — Kickoff prompt (paste into a fresh Claude Code session)

```
Read, in order: CLAUDE.md, briefs/<id>.md, docs/handoffs/HANDOFF-<id>.md.
We are building module <id> only. Follow the Implementation checklist at the
bottom of the brief in exact order, steps 1–3 only in this session:
schema.ts + migration, zod.ts, service.ts with unit tests.
Rules that override anything else you infer: the handoff §3–§6 defines
fields/queries/operations/state machines; the brief's Global conventions
define tenancy, money, audit, events. Ask before deviating.
Stop after step 3 and show me: the schema, the migration SQL, and the test
run output.
```

Review checkpoint, then continue in the same or next session with steps 4–8 (queries → actions → jobs/events → tools → register), then steps 9–11 (seed, full test pass, k6 if flagged).

### Step C — Review gates (you; do not delegate these to Claude Code)
1. **Migration SQL read-through** — every table has company_id + indexes the queries need; ⚖ tables registered for audit; enums match handoff §6; `hourly_outputs`-class tables partitioned
2. **Tenancy test present and passing** — cross-company read returns 0 rows for at least one table in this module
3. **State-machine test** — one illegal transition per status field asserts a 409
4. **queries.ts diff against handoff §3** — field-for-field; anything extra gets cut, anything missing gets added
5. **Gates are server-side** — grep the UI assumptions out: no gate may exist only in a disabled button
6. **No drift into core** — `git diff --stat src/modules/core` must be empty in a module PR

### Step D — Merge ritual
- PR title `feat(<module>): <id> backend`, description generated from the handoff
- CI green (lint incl. no-float-money + analytics-no-writes, typecheck, unit, integration, migrate-check)
- Squash-merge; tag `module/<id>-done`; tick the module in `docs/PROGRESS.md`

### Step E — Post-merge (30 min, same day)
- Run the seed, click through the module's screens against the real backend, file anything broken as issues NOW (not "later")
- If the module emits events others consume, verify one consumer end-to-end (e.g. after 6.1: a machine downtime actually opens a 9.1 ticket — even against the stub)

---

## 3. Flagship-module addenda (extra steps, non-negotiable)

**1.3 Orders & TNA** — before service.ts, write the TNA test vectors: 10 scheduling cases (backward scheduling, dependency chains, ripple on slip, LC conflict) as failing tests first. The ripple `previewRipple` must be a pure function.

**6.1 Line Tracking ⚡** — build the k6 scenario `k6/production_burst.js` BEFORE optimizing anything; first run establishes the baseline. Phase can't close until: 50 lines × 10 concurrent burst entries + 20 dashboard readers → write p95 < 500ms, board read p95 < 800ms, zero lost/duplicated rows (assert row counts after the run). Replay the same offline_key batch twice; row count must not change.

**10.1 Payroll 🔒** — order is inverted: gazette test vectors FIRST (get the current gazette table from the factory; encode ≥15 cases: each grade, OT boundary, partial month, maternity, festival pro-rata, deduction floor), then the pure compute function until all pass, then everything else. Plus: a test proving a `member`-role request to any payroll endpoint gets 403 with an empty body. Before any real factory go-live: one full month parallel-run against their existing Excel, diff every net figure.

**X.1 Approve Inbox** — the re-validation test: insert a pending change, migrate the target module's zod to reject it, approve must fail gracefully with the schema error, not commit.

---

## 4. Cross-cutting cadences (weekly, regardless of module)

- **Monday:** review `pg_stat_statements` top 10 (>200ms), file slow-query issues
- **Per merge:** `docs/STUBS.md` — any stub whose real module is now built gets replaced this week, not eventually
- **Friday:** restore-latest-backup drill on the scratch VPS **once Phase 1 is done** (weekly until it's boring, then monthly); Sentry triage to zero-or-ticketed
- **Every phase close:** run the FULL k6 suite, not just the new scenario — regressions hide in old paths

---

## 5. When things go wrong (the honest playbook)

- **Claude Code proposes a "better" schema than the handoff** → the answer is no by default; if it's genuinely right, update the HANDOFF §4 first (2-line edit + re-review), then build. The document trail is the point.
- **Handoff §3 turns out wrong mid-build** (screen needs a field nobody wrote down) → same rule: patch the handoff, note it in §8 as resolved, continue. Never let code silently diverge from the handoff.
- **A migration is wrong after merge** → forward-fix migration only; never edit an applied migration file.
- **Two modules deadlock on each other's contracts** → the module earlier in the phase order owns the contract; the later one adapts.
- **Velocity pressure to skip tests on a "simple" module** → the tenancy test and the state-machine test are the two you never skip; everything else is negotiable for a genuinely trivial module, those two are not.

---

## 6. Model routing — when to use which model

Two separate concerns: models the PRODUCT calls (MARBIM), and models YOU use while building (Claude Code).

### 6a. Inside the product (MARBIM — encode this in `modules/marbim` and each module's `tools.ts`)

| Task | Model tier | Why |
|---|---|---|
| Document extraction (PO/LC/challan/audit PDFs, photos of handwritten sheets) | Gemini (vision + cheap at volume) | Highest call volume in the product; per-field confidence comes from structured extraction, cost dominates |
| Chat/copilot reasoning, multi-tool answers ("which milestones are at risk?"), drafting emails/quotes | Claude Sonnet | Best tool-use reliability per taka; the default for anything conversational |
| High-stakes reasoning: LC clause vs B/L discrepancy checks, payroll anomaly explanation, revision diff interpretation | Claude Opus-tier (top model) | Wrong answers here cost real money; low volume justifies cost |
| Embeddings (sample library search, requirement matching, RAG) | OpenAI text-embedding | Cheap, standard, stored in pgvector |
| Classification/routing (which module does this dropped file belong to?) | Haiku-tier (small fast model) | Milliseconds and fractions of a cent; run before the expensive extractor |

Rules: route by task type in the model registry, never hardcode a model string in a module; every model call logs `(model, task, tokens, latency)` so you can re-route on data; extraction ALWAYS runs in the BullMQ queue regardless of model; if a cheap-tier call returns low confidence, escalate the same job to the higher tier once before surfacing a low-confidence draft.

### 6b. While building (Claude Code)

| Work | Model | Why |
|---|---|---|
| Repo restructure, boilerplate per the module contract, migrations, seed generators, test scaffolding | Fast/default tier | Mechanical, pattern-following; the module contract makes it safe |
| service.ts for flagship modules (1.3 TNA engine, 10.1 payroll compute, X.1 approve), debugging cross-module issues, k6 result analysis | Top tier (Opus-class) | These are the files where a subtle bug is expensive; reasoning depth pays for itself |
| Review passes ("find tenancy leaks in this diff") | Top tier | Cheaper than a production incident |

Default to the fast tier; escalate per-file, not per-project. If a session is producing code you keep correcting, that's the signal to switch up a tier — or to fix the handoff, which is more often the real problem.


- Every module in `briefs/README.md` ticked in `docs/PROGRESS.md`
- Full k6 suite green on VPS-class hardware; security checklist (dev plan §6) all ticked
- Backup restored successfully on a clean machine within the 4h RTO, timed and documented
- Seed → demo walkthrough of the complete order-to-cash flow (inquiry → paid) succeeds using only the UI
- One pilot factory's real documents (PO, LC copy, challan, wage sheet) extracted, approved, and flowing — the system has touched reality
