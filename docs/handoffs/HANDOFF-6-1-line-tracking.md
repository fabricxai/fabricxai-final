# HANDOFF-6-1-line-tracking — Line Tracking

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/6-1-line-tracking.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/production` · **Brief:** `docs/02-backend/briefs/6-1-line-tracking.md`

## §5 · Operations

Every name below is exported from `src/modules/production/service.ts`.

| operation | what it does |
|---|---|
| `recordHourlyOutputs` / `...In` | The hour's count per line. `(line, date, hour)` is a unique natural key and the insert is `ON CONFLICT DO UPDATE`, which is what makes a replayed burst safe. |
| `getBoard` | The floor board: target vs actual by line and hour. |
| `openLineDowntime` / `...In` | A line stops. Emits `production.downtime.machine`, which raises a maintenance ticket. |
| `closeLineDowntime` / `...In` | The line runs again. |
| `recordEndlineCount` / `...In` | Endline pieces — the count quality's DHU is a fraction of. |
| `closeDay` | Closes the production day; emits `production.day.closed`. |
| `runRate` | Efficiency: earned minutes (SMV × output) / available minutes. |
| `registerProductionSyncHandlers` | Four operations on the offline batch endpoint. |

## §6 · State machines

**None, and that is a decision rather than an omission.**

An hourly output has no lifecycle — it is a measurement of an hour that has happened. A
downtime has an open and a close, which is two timestamps on one row rather than a status
somebody could move backwards. Adding a machine here would invent states the floor does not
have.

## §7 · Gates

None. Nothing about recording what a line produced should be refusable — a supervisor
reporting a bad hour is reporting a fact, and a system that argued with them would be one
they stopped using.

The constraints that exist are structural: the natural key makes a replay idempotent, and
`hourly_outputs` is partitioned because it is the highest-volume table in the product.

## §8 · Open questions

None.

## §9 · Non-functional

⚡ **The flagship load scenario.** `k6/production_burst.js` — 50 lines, 10 concurrent
writers, 20 boards polling. Brief thresholds: write p95 < 500ms, board read p95 < 800ms,
and zero lost or duplicated rows asserted from ROW COUNTS rather than response codes,
because a 200 that wrote nothing is the failure it exists to find.

Baseline (plan 7.1, production build, developer hardware): write p95 **91ms**, board read
p95 **73ms**, 0% failures, row count bounded by lines × 24 and unchanged on replay.
`k6/baselines/production_burst.json`. The brief's gate is VPS-class hardware, so that is a
regression reference and not the release decision.

## §10 · Seed

`src/db/seed/production-slice.ts` — six sewing lines, a week of hourly outputs, downtime
rows both open and closed, and endline counts.
