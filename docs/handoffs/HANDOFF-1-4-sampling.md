# HANDOFF-1-4-sampling — Sampling

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/1-4-sampling.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/sampling` · **Brief:** `docs/02-backend/briefs/1-4-sampling.md`

## §5 · Operations

Every name below is exported from `src/modules/sampling/service.ts`.

| operation | what it does |
|---|---|
| `createSampleRequest` / `commitSampleRequestDraft` | A sample is asked for. |
| `advanceStage` | Moves the request through its states. |
| `dispatchSample` | It goes to the buyer. |
| `recordFeedback` / `commitFeedbackRoundDraft` | The buyer's verdict and comments. **This is what opens cutting.** |
| `closeSampleRequest` | Terminal. |
| `addSampleCost` | What the sample cost to make. |
| `resolvePpApproval`, `checkPpApprovalFor` | The PP verdict, read by cutting. |
| `ppBlockingAlerts`, `emitPpBlocking` | Orders whose cutting date is near and whose PP is not approved. |
| `sampleTimeline`, `overdueSamples` | The merchandiser's view. |

## §6 · State machines

`sampleRequestMachine`

| from | to |
|---|---|
| `requested` | `in_work`, `closed` |
| `in_work` | `dispatched`, `closed` |
| `dispatched` | `feedback`, `closed` |
| `feedback` | `approved`, `rejected`, `closed` |
| `approved` | `feedback`, `closed` |
| `rejected` | `in_work`, `feedback`, `closed` |
| `closed` | — terminal |

`approved` → `feedback` is not a mistake. A buyer who approved a sample and then sent a
further comment is the normal case, and a machine that refused it would force somebody to
record the second comment as a new request and lose the thread.

## §7 · Gates

`GATES.ppApproval` is DEFINED by this module and ENFORCED in cutting. The verdict lives
here; the refusal happens where the cloth is.

`recordFeedback` is therefore the highest-consequence write in the module: three verdicts
(`approved`, `approved_with_comments`, `rejected`) that are one word apart on a buyer's
comment sheet and a floor apart in meaning. It is why the MARBIM draft tool's provenance
line says the verdict is what gates cutting.

## §8 · Open questions

None.

## §9 · Non-functional

`sampling/advance_stage` and `sampling/record_feedback` are on the offline batch endpoint —
a sampling room is as likely to lose the network as a cutting floor.

No k6 scenario: a factory runs tens of samples a month, not thousands an hour.

## §10 · Seed

`src/db/seed/sampling-slice.ts` — requests in every status, feedback rounds including an
approval and a rejection, and one order deliberately left with an unapproved PP so cutting's
gate has something to refuse.
