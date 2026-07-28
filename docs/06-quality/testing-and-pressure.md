# FabricXAI — Testing & Pressure Plan
### One document for "does it work" and "does it survive"

---

## 1. The test pyramid (what runs where)

| Level | Tool | Owns | Runs |
|---|---|---|---|
| Unit | Vitest | pure logic: TNA scheduling/ripple, payroll gazette vectors, AQL tables, capacity math, wastage, Money, scenario compute | every commit |
| Integration | Vitest + Testcontainers PG | services on real Postgres: tenancy walls, state machines, gates, pending insert+approve revalidation, offline idempotency, reservation locking | every commit |
| Contract | Vitest | every HANDOFF §5 op exists; Zod accepts §3 payloads | every commit |
| AI evals | eval runner | golden-document sets per extractor; regression blocks prompt merges | prompt changes + nightly |
| E2E | Playwright | the golden path (RFQ→order→store→production→approve→ship) + owner night-check | merge to main |
| Load ⚡ | k6 | scenario catalog below | phase close + release |
| Restore drill | pgBackRest | full restore to scratch VPS, timed vs RTO 4h / RPO 15min | weekly→monthly |
| Accessibility | axe-core | every component demo + module screens | every commit |

**The two never-skipped tests** (from the playbook): cross-tenant returns 0 rows; illegal state transition returns 409.

## 2. Seed = the pressure fixture

`pnpm seed --scale=pilot|factory|stress`
- **pilot:** 1 company, 12 buyers, 40 orders, 10 lines, 90d history
- **factory:** 40 buyers, 250 orders/2yrs, 50 lines, **1.2M hourly_outputs**, 30k rolls, 2,400 workers, 60 open LCs, 8 UDs
- **stress:** 3 companies at factory scale (tenancy under load), 5M hourly rows, 5k pending items

Deliberate edge rows in every scale: LC conflict, overdrawn-UD attempt, 38% line, negative-margin order, shade-mix warning, aged discrepant submission, worker with 96h OT.

## 3. k6 scenario catalog (targets on VPS-class hardware, factory seed)

| Scenario | Shape | Pass criteria |
|---|---|---|
| `production_burst` | 50 lines × 10 concurrent hourly batches + 20 board readers | write p95 < 500ms · read p95 < 800ms · **zero lost/dup rows** (post-run count assert) · replayed batch = no-op |
| `store_grn` | 8 keepers entering GRNs+issues incl. bonded UD draws, concurrent | issue p95 < 600ms · UD never overdrawn under race (post-run invariant query) |
| `approve_inbox` | 5k pending, 3 managers batch-clearing 50s | list p95 < 300ms · batch(50) < 2s · every commit audited |
| `owner_dashboard` | 30 phones polling feed+KPIs while derive jobs run | feed p95 < 400ms (cached) · no job starvation |
| `order_desk` | 15 merchandisers: breakdown edits, TNA actualize w/ ripple, revision apply | ripple preview p95 < 700ms · no deadlocks at 2 editors/1 order (row-lock ordering test) |
| `extraction_flood` | 40 documents dropped in 2 min, chat active | interactive chat p95 unaffected (< +10%) · queue drains within budget · per-company limit honored |
| `mixed_day` | all above at 60% intensity simultaneously, 30 min soak | no error-rate creep · memory flat · p95s hold |

`mixed_day` is the release gate — single scenarios pass long before the mixture does.

## 4. Pressure beyond load

- **Chaos drills (pre-pilot week):** kill worker mid-extraction (job resumes); kill app mid-approve (no partial commit); drop Redis 60s (app degrades, recovers); revoke AI keys (honest errors, queue holds); disk-full on MinIO (uploads fail clean).
- **Data-volume time-travel:** run `derive` jobs against stress seed — nightly TNA scan and day-close must finish inside their windows (< 5 min each).
- **Concurrency invariants as queries:** after every load run, assert: Σ(UD consumption) ≤ authorized; Σ(BTB) ≤ master×limit; no order with committed qty > breakdown+tolerance; audit rows ≥ ⚖ mutations.

## 5. Payroll's special regime

Gazette vectors before code (≥15 cases) · deterministic recompute (same inputs → identical run, hashed) · one-month parallel run vs the factory's Excel with every net diffed to zero or explained · role-lockout test (member → bodyless 403) in the never-skip set for this module.

## 6. Release checklist (every production deploy)

CI fully green incl. evals · migrate-check clean · k6 `mixed_day` within 5% of last baseline · Sentry release tagged · backup verified < 24h old · rollback plan named in the PR (forward-fix migration ready if schema changed).
