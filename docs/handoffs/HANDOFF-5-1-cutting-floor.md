# HANDOFF-5-1-cutting-floor — Cutting Floor

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/5-1-cutting-floor.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/cutting` · **Brief:** `docs/02-backend/briefs/5-1-cutting-floor.md`

## §5 · Operations

Every name below is exported from `src/modules/cutting/service.ts`.

| operation | what it does |
|---|---|
| `createMarker` | A marker plan: size ratio, lay length, efficiency. |
| `commitMarkerDraft` | The `pending_changes` commit handler for a MARBIM-drafted marker. |
| `ppApprovalStatus` | Reads sampling's PP verdict. The gate's input, read through the owning module (rule 11). |
| `createLay` | Opens a lay. **Refused unless PP is approved** — see §7. |
| `recordCutReport` | Actual pieces cut against a lay. |
| `generateBundles` | Bundles from a cut report, once. |
| `scanBundle` | A bundle moves; drives `bundleMachine`. |
| `recomputeWastage` | Marker vs actual, after a correction. |
| `cutPosition` | Cut-to-plan by order and colour — the grid, never a total. |
| `commitCutReportCorrection` | Commit handler for a corrected report. |

## §6 · State machines

`layMachine`

| from | to |
|---|---|
| `open` | `cut`, `cancelled` |
| `cut` | — terminal |
| `cancelled` | — terminal |

`bundleMachine`

| from | to |
|---|---|
| `created` | `in_sewing` |
| `in_sewing` | `done` |
| `done` | — terminal |

Both are one-way. Cloth that has been cut cannot be uncut, and a machine that allowed the
reverse would let a floor's output figures be edited after the fact.

## §7 · Gates

`GATES.ppApproval` — **cutting cannot start before the buyer's pre-production sample is
approved.** Server-side in `createLay`. This is the module's whole reason for having a gate:
cutting against an unapproved PP is a factory converting cloth into something the buyer has
not agreed to buy, and it is unrecoverable — the cloth is cut.

Read from sampling through `checkPpApprovalFor`, not from a local copy.

## §8 · Open questions

None.

## §9 · Non-functional

Floor-facing. `cutting/create_lay` and `cutting/record_cut_report` are registered on the
offline batch endpoint with `offline_key` idempotency, because a cutting room loses the
network and a supervisor cannot wait for it.

No dedicated k6 scenario. Cutting is bursty but low-volume next to line tracking — a lay is
opened a few times a shift, not fifty times a minute.

## §10 · Seed

`src/db/seed/cutting-slice.ts` — markers, lays in each status, cut reports and bundles,
including an order whose PP is NOT approved so the gate can be seen refusing.
