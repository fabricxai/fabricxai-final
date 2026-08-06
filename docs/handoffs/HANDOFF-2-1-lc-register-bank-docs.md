# HANDOFF-2-1-lc-register-bank-docs — LC Register, UD & Bank Documents

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/2-1-lc-register-bank-docs.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/commercial` · **Brief:** `docs/02-backend/briefs/2-1-lc-register-bank-docs.md`

## §5 · Operations

Every name below is exported from `src/modules/commercial/service.ts`.

| operation | what it does |
|---|---|
| `createLc`, `amendLc` | The master LC and its amendments. |
| `createUd`, `commitUdFromScan` | A customs Utilization Declaration for bonded fabric. |
| `checkUdBalance`, `getUdBalance` | What is left to draw. |
| `drawUd`, `drawUdStandalone` | A bonded receipt or issue draws against it. |
| `proposeUdOverride`, `commitUdOverride` | The only way past a UD block, and it goes through `pending_changes`. |
| `expireLapsedUds`, `snapshotReconciliation` | Nightly hygiene and the customs reconciliation. |
| `checkBtbHeadroom` / `...In`, `openBtb` | Back-to-back LC against a percentage of the master. |
| `openSubmission`, `setSubmissionStatus` | The bank-document presentation. |
| `postRealization`, `recordBankCharge` | Money arriving, and what the bank took. |
| `agingDiscrepancies`, `buyerRealizationLag` | What is stuck, and which buyer is slow. |

## §6 · State machines

`udMachine`

| from | to |
|---|---|
| `active` | `exhausted`, `expired`, `closed` |
| `exhausted` | `expired`, `closed` |
| `expired` | `closed` |
| `closed` | — terminal |

`submissionMachine`

| from | to |
|---|---|
| `preparing` | `submitted` |
| `submitted` | `accepted`, `discrepant` |
| `accepted` | `realized`, `discrepant` |
| `discrepant` | `submitted`, `realized` |
| `realized` | — terminal |

`accepted` → `discrepant` exists because a bank can accept a presentation and raise a
discrepancy afterwards, and pretending otherwise would leave the real state unrecordable.

## §7 · Gates

Three, and they are the module's reason for existing.

**UD balance** — a bonded issue beyond the declared quantity is duty evasion. Hard block,
overridable only through `pending_changes` with a second signature.

`GATES.btbHeadroom` — a back-to-back LC is capped at a percentage of the master. Opening one
beyond it commits the factory to more than the buyer's LC will cover.

`GATES.expNumber` — an export shipment cannot go to the bank without its EXP number. Bangladesh
Bank will refuse the presentation, and discovering that at the bank costs a shipping window.

**LC latest-shipment conflict** is a red alert rather than a block: the date is already
wrong by the time anybody sees it, and refusing the write would stop somebody recording
reality.

## §8 · Open questions

None.

## §9 · Non-functional

⚖ throughout. Every table here writes `audit_log` through the core interceptor — this is
the module where a wrong row is a customs or a bank problem rather than an internal one.

`lcs` has ONE writer module (rule 11): commercial. Shipment and finance read it through
`queries.ts`.

## §10 · Seed

`src/db/seed/commercial-slice.ts` — an LC with an amendment, UDs in each status including one
near exhaustion and one expired, a BTB at the headroom limit, and submissions in every state
including a discrepant one.
