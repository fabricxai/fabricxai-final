# HANDOFF-7-1-inline-endline-final-inspection — Inline, Endline & Final Inspection

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/7-1-inline-endline-final-inspection.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/quality` · **Brief:** `docs/02-backend/briefs/7-1-inline-endline-final-inspection.md`

## §5 · Operations

Every name below is exported from `src/modules/quality/service.ts`.

| operation | what it does |
|---|---|
| `upsertDefectCode` / `seedDefaultDefectCodes` / `commitDefectCode` | The defect taxonomy. |
| `captureInlineCheck` | An inline check at a station. |
| `closeDhuDay` | Closes the day's DHU — defects per hundred units. |
| `repeatDefectAlerts` | The same defect recurring on a line, which is a process fault rather than a worker's. |
| `inspectFabric` / `resolveFabricInspection` | 4-point on a roll. Feeds the store's issue gate. |
| `createMeasurementSpec` / `commitMeasurementSpec` | The buyer's tolerance table. |
| `recordMeasurementCheck`, `recordMeasuredSet` / `...In` | Measured pieces against that spec. |
| `aqlPlanFor` | The sampling plan for a lot size. |
| `runFinalInspection` / `...In`, `setFinalInspectionStatus` | The AQL inspection itself. |
| `resolveFinalInspectionGate`, `checkFinalInspectionPassed` | What shipment asks before a bank handoff. |
| `scheduleThirdPartyInspection`, `recordThirdPartyResult` | The buyer's own inspector. |
| `preFinalReadiness`, `buyerReportPack` | What the merchandiser sends the buyer. |

## §6 · State machines

`finalInspectionMachine`

| from | to |
|---|---|
| `draft` | `submitted`, `closed` |
| `submitted` | `reinspection_required`, `closed` |
| `reinspection_required` | `submitted`, `closed` |
| `closed` | — terminal |

`reinspection_required` → `submitted` is the loop a failed lot goes round after rework, and
it is the only way back. A `closed` inspection is a fact the shipment gate reads, so it does
not reopen.

## §7 · Gates

`GATES.fabricInspection` — cloth that failed 4-point cannot be issued. Raised here,
enforced in the store's `issueStockIn`.

**Final inspection passed** gates the bank-document handoff in shipment
(`checkFinalInspectionPassed`). Goods that failed AQL do not leave, and the export documents
cannot be submitted on them.

## §8 · Open questions

None.

## §9 · Non-functional

Floor-facing. `quality/inline_check`, `quality/final_inspection` and
`quality/measurement_set` are on the offline batch endpoint.

Two screens post straight to server actions instead, deliberately, and it is recorded in
`docs/STUBS.md`: `quality/fabric` grades cloth at a fixed frame in the store — mains power,
metres from the router — and queuing would let two inspectors grade the same roll on two
devices with no way to reconcile which sheet is real.

## §10 · Seed

`src/db/seed/quality-slice.ts` — defect codes, inline checks across a week, a measurement
spec with tolerances, and final inspections in each status including one requiring
reinspection.
