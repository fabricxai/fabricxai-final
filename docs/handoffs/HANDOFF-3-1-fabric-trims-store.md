# HANDOFF-3-1-fabric-trims-store — Fabric & Trims Store

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/3-1-fabric-trims-store.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/store` · **Brief:** `docs/02-backend/briefs/3-1-fabric-trims-store.md`

## §5 · Operations

Every name below is exported from `src/modules/store/service.ts`.

| operation | what it does |
|---|---|
| `getStock` | On-hand / reserved / free by item, location and roll. The read the floor and cutting both plan from. |
| `receiveGrn` / `receiveGrnIn` | A challan arrives. Bonded ⇒ `ud_id` required and the UD balance is checked before a roll exists. |
| `setGrnInspectionStatus` | The 4-point result against a received GRN. |
| `createRequisition` | Computed lines for an order from consumption × qty × wastage. |
| `issueStock` / `issueStockIn` | Rolls leave the store against a requisition. Bonded rolls draw the UD. |
| `commitStockAdjustment` | The `pending_changes` commit handler. An adjustment is the one store write with no physical event behind it, so it is the one that always needs a second person. |
| `registerStoreSyncHandlers` | `store/receive_grn` and `store/issue_stock` on the offline batch endpoint (rule 7). |

## §6 · State machines

`rollMachine` — a roll's life, and it is deliberately one-way at the end.

| from | to |
|---|---|
| `in_stock` | `issued`, `adjusted_out` |
| `issued` | `returned`, `adjusted_out` |
| `returned` | `issued`, `adjusted_out` |
| `adjusted_out` | — terminal |

`adjusted_out` is terminal because writing a roll off is an assertion that it is not there.
A roll that could come back from it would let a shortfall be made to disappear and then
reappear, which is the shape of a theft nobody can see in the ledger.

## §7 · Gates

`GATES.fabricInspection` — cloth that failed 4-point cannot be issued. Server-side in
`issueStockIn`, not in the screen: the offline batch endpoint is a second door into the same
write and a UI-only check would leave it open.

**UD balance** is enforced in `receiveGrnIn` and on issue rather than as a named gate: a
bonded GRN without a `ud_id` is refused outright (`store.errors.bonded_requires_ud`), and a
draw beyond the balance is legal exposure, so it is a hard block rather than a warning.

## §8 · Open questions

None. The two decisions this module leaves to a person are recorded in `docs/STUBS.md`
rather than here, because they are deliberate and are not waiting on an answer:

- `store/rolls` posts a stock ADJUSTMENT straight to a server action rather than through the
  offline queue. Nothing physically happened — somebody is asserting the record is wrong —
  and it goes through `pending_changes`, so there is nothing to replay.
- Shade-mix is a warning flag in the response, not a refusal. The floor decides.

## §9 · Non-functional

⚡ and floor-facing. `getStock` must stay fast at 10⁵ roll rows — covering indexes on
`(company_id, item_id, status)` and `(company_id, location_id)`.

k6: `store_grn` (plan 7.1) drives `receive_grn` through `/api/sync` at 8 concurrent
storekeepers. Baseline in `k6/baselines/store_grn.json`. The row assertion is the
`offline_key` ledger — a replayed batch must add nothing, and the recorded run submitted
2,200 rows, reported 2,200 duplicates and created 0.

## §10 · Seed

`src/db/seed/store-slice.ts` — items across all three kinds, locations in all three kinds
(bonded, general, floor), GRNs including a bonded one with a UD, and rolls in every status
the machine has so the transitions are exercisable from a seeded database.
