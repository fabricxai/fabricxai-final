# HANDOFF-X-1-approve-inbox — Approve Inbox

> **Retroactive, and it says so.** The PLAYBOOK's rule is "no handoff → no build", with §8
> empty before work starts. This module was built without one. Writing it now cannot make
> that true — a contract that follows the work is a description, not a contract — so this
> documents what SHIPPED and becomes the module's acceptance checklist for the pilot.
>
> What that costs: nothing here constrained a design decision, so where the code and the
> brief disagree, this file records the code. The brief (`docs/02-backend/briefs/X-1-approve-inbox.md`)
> still wins on invariants — tenancy, money, gates, audit — because those are rules, not
> decisions, and the code being different would be a bug rather than a divergence.
>
> **§5 and §6 are checked by a test.** `docs/__tests__/handoff-contract.test.ts` fails if an
> operation named here does not exist in the module, or a state machine does. That is what
> stops this file becoming the next thing that quietly stopped being true.

**Module:** `src/modules/approvals` · **Brief:** `docs/02-backend/briefs/X-1-approve-inbox.md`

## §5 · Operations

Every name below is exported from `src/modules/approvals/service.ts`.

| operation | what it does |
|---|---|
| `inbox` | Drafts routed to THIS reviewer's roles, not every draft in the company. |
| `inboxCounts` | The badge. |
| `matchRule` | Which approval rule governs a draft. |
| `approversFor` | Who may sign this one. |
| `agingDrafts`, `emitAgingEscalations` | Drafts nobody has touched, and the nightly escalation. |
| `auditChain` | Who let this row in — asked months later, when a figure is disputed. |
| `correctionRates`, `correctionRate` | How often an extractor's drafts get corrected. The honest measure of whether to trust it. |
| `upsertApprovalRule` | Who approves what. |
| `hoursBetween` | Pure helper, exported for its own tests. |

The commit path itself is `modules/core/pending-changes.ts` — `propose`, `approve`, `reject`.
This module decides WHO and SURFACES what; core does the writing.

## §6 · State machines

**None here.** The draft lifecycle (`pending` → `committed` / `rejected`) lives in
`pending_changes` and is enforced by `approve()` under a row lock, which is where it has to be:
a second approve must get a typed 409 while exactly one commit happens, and that is a
transaction property rather than a state table.

## §7 · Gates

**Auto-approve is the gate, and it fails closed.** A rule may skip the human only if it
declares a confidence floor AND every field clears it. Confidence is stored per field
precisely so an average cannot hide the one field the extractor was unsure about.

Since plan 6.3, `ai_chat` drafts carry no confidence at all — nothing measured them — so
`confidence_min` is null and they can never clear a floor. They always get a person.

## §8 · Open questions

**One, deliberate and recorded rather than resolved.**

Nothing stops somebody approving their own draft. `actions.ts` documented that refusal as an
existing control in core; it has never existed — `approve()` checks the approver's ROLE and
counts DISTINCT approvers, and never compares `ctx.userId` to `created_by`.

It is not obviously a bug: the intended intake flow is that whoever uploaded the PO reviews
the extraction and signs it, and a blanket ban would break the main path. What IS enforced is
that a rule demanding two approvals gets two different people (unique index). The decision is
owed; the false comment is corrected. Tracked in `docs/STUBS.md`.

## §9 · Non-functional

The funnel everything AI-written passes through, so its correctness matters more than its
throughput. 29 commit targets are covered by `commit-targets.integration.test.ts`, which
ratchets in both directions — a new registered target with no test fails the build.

`upsertApprovalRule` has no caller: the rules that decide who approves what can only be set
by seeding or by hand. Recorded in `docs/STUBS.md`; owed before pilot.

## §10 · Seed

`src/db/seed/core-slice.ts` — approval rules covering both branches (one always needing a
human, one auto-approving above a confidence floor), and pending changes at high confidence,
low confidence, human-drafted and rejected.
