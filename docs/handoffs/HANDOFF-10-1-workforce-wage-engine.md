# HANDOFF-10-1-workforce-wage-engine — Workforce & Wage Engine

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/10-1-workforce-wage-engine.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/workforce` · **Brief:** `docs/02-backend/briefs/10-1-workforce-wage-engine.md`

## §5 · Operations

Every name below is exported from `src/modules/workforce/service.ts`.

| operation | what it does |
|---|---|
| `assertPayrollAccess` | The lock. hr + owner only, at the service layer, and a 403 with no body shape. |
| `uploadGazette`, `commitGazetteFromScan` | The government wage-grade table, versioned. |
| `activateGazette` | Makes a version the one in force. |
| `computePayrollRun` | The month. Pure `computePayroll` inside a transaction; deterministic, so the same inputs give an identical run. |
| `getPayrollLines` | Per-worker detail. Reads are audited. |
| `approvePayrollRun` | The owner signs. |
| `getActiveGazette` | Which grades are in force. |

## §6 · State machines

`gazetteMachine`

| from | to |
|---|---|
| `draft` | `active` |
| `active` | `superseded` |
| `superseded` | — terminal |

`payrollRunMachine`

| from | to |
|---|---|
| `draft` | `computed` |
| `computed` | `computed`, `approved` |
| `approved` | `disbursed` |
| `disbursed` | — terminal |

`computed` → `computed` is a recompute, and it is allowed only until somebody approves. An
approved or disbursed run is a paid fact: correcting it is a new period's adjustment, not a
rewrite of what people were told they were getting.

## §7 · Gates

No `GATES.*` entry, and the reason matters: this module's gate is **role**, not state.
`assertPayrollAccess` is enforced in the service rather than only at the API, so every path
into a payroll figure passes it, and a member gets a bodyless 403 rather than a shape they
could learn from.

Reads are audited. Who looked at whose pay is a question this module must be able to answer.

## §8 · Open questions

**One, and it is not answerable in code.** The parallel run has never happened.

`docs/06-quality/testing-and-pressure.md` requires one month against the factory's own sheet
with every net diffed to zero or explained, before go-live. Plan 7.4 built the tool
(`pnpm payroll:parallel-run`) and proved it end to end, so the gate is executable — but the
run itself needs a real gazette, a real month of attendance and a factory's own spreadsheet.
Tracked in `docs/STUBS.md`. **This is the one §8 entry in the pilot set that is genuinely
open, and it blocks go-live rather than the build.**

## §9 · Non-functional

🔒 The module where a leak is another person's wage bill. `require-tenant-predicate` is
enabled on `service.ts` and `queries.ts` — the first module adopted onto rule 2's second
wall, chosen first for exactly that reason.

Wages follow the gazette grade table; OT is 2× basic hourly (basic/208); two festival
bonuses a year, pro-rated. Fifteen gazette vectors plus a determinism test.

## §10 · Seed

`src/db/seed/workforce-slice.ts` — a gazette with the real grade shape, workers across grades,
attendance for a month, and a computed payroll run.
