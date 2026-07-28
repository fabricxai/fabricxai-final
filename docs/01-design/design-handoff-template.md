# FabricXAI — Design → Backend HANDOFF Template

**Purpose.** After a module's frontend is locked in Claude Design, fill one copy of this file (`handoffs/HANDOFF-<module>.md`, committed to the repo). It is the *bridge document*: it converts what the screens actually proved they need into the final backend contract, superseding the draft brief in `fabricxai-backend-briefs.md` wherever they differ.

**Rules of the handoff:**
1. The **design wins on fields and states** (it knows what the user sees), the **brief wins on invariants** (tenancy, money rules, gates, audit). Conflicts between them go in §8, resolved before build starts.
2. Every screen must trace to endpoints; every endpoint must trace to a screen or a job. Anything with no consumer gets cut.
3. No backend build starts on a module until its handoff is reviewed by one frontend person + one backend person and the §8 list is empty.

---
---

## HANDOFF-<module-id> <Module Name>

| | |
|---|---|
| Design source | Claude Design session/link + export commit hash |
| Design locked on | date |
| Filled by | name |
| Reviewed by | FE name / BE name |
| Supersedes | brief §<n> in fabricxai-backend-briefs.md |
| Build status | not started / in progress / done |

### 1. Screen inventory
List every screen/state the design produced. IDs are referenced throughout this file.

| ID | Screen | Density | Roles that see it | Notes |
|---|---|---|---|---|
| S1 | | desk/floor/phone/tv | | |
| S2 | | | | |

For each screen also record: empty state exists? loading state (weave)? offline state (if floor)? error states designed?

### 2. Component mapping
Which design-system components each screen uses, and any NEW component the design introduced (new components need a name, a spec ref, and a home in `src/components/`).

| Screen | Existing components used | New components introduced |
|---|---|---|

### 3. Data contract per screen
The core of the handoff. For each screen: exactly what data it renders and what it writes. This is what finalizes entity fields.

```
S<id> <name>
READS:
  <entity>.<field>          — where shown, format (currency? unit? derived?)
  derived: <name>           — formula, computed where (server/job/client)
WRITES:
  <operation>               — payload shape, validation the UI expects
                              server to enforce, optimistic or not
SORT/FILTER/SEARCH:         — which columns; server-side or client
PAGINATION/VIRTUALIZATION:  — page size / infinite / virtualized full-set
REALTIME NEEDS:             — none / poll <interval> / push
```

### 4. Final entity deltas
Diff against the draft brief, settled by §3.

| Entity | Change (+field / −field / type change / new entity) | Reason (screen ref) |
|---|---|---|

### 5. API surface (final)
Every endpoint/server action this module ships. Naming: `module.verbNoun`.

| Operation | Kind (query/mutation/batch/job-trigger) | Auth (roles) | Called from | Idempotent? | Notes |
|---|---|---|---|---|---|

### 6. State machines (final)
For every status field: states, allowed transitions, who/what triggers each, side-effects (events emitted). Draw as list: `state → state (trigger, actor, emits)`.

### 7. Cross-module contracts
What this module consumes from and provides to others — with the owning module named. Gates (hard server-side blocks) listed explicitly.

| Direction | Contract | Owner | Gate? |
|---|---|---|---|
| consumes | | | |
| provides | | | |

### 8. Conflicts & open questions  ⚠ must be empty before build
| # | Conflict (design vs brief) or open question | Resolution | Decided by / date |
|---|---|---|---|

### 9. Non-functional (from the design)
- Load shape this module's screens imply (rows on screen, write bursts, dashboard read concurrency) → what k6 scenario covers it
- Offline scope: which writes queue, idempotency key scheme
- i18n: count of new keys, any strings that broke at 1.4× length in review
- Permissions matrix confirmed (role × screen × read/write/approve)
- Audit (⚖) and privacy (🔒) obligations carried from the brief

### 10. Seed & demo data
What realistic seed the module needs for demo + testing (entities, volumes, edge rows — e.g. "one order with LC conflict, one line at 38% efficiency").

---
---

# FILLED EXAMPLE — HANDOFF-X.1 Approve Inbox
*(abridged real example so the template's expectations are unambiguous)*

| | |
|---|---|
| Design source | Claude Design "approve-inbox-v2", export commit `3f9a1c` |
| Design locked on | (example) |
| Supersedes | brief §X.1 |

### 1. Screen inventory
| ID | Screen | Density | Roles | Notes |
|---|---|---|---|---|
| S1 | Pending list | desk | manager, owner, admin | filter bar: module, source, age, confidence; keyboard J/K/A/R |
| S2 | Item detail (create) | desk | same | field list + confidence bars + click-to-source panel |
| S3 | Item detail (update) | desk | same | before/after diff, changed cells highlighted |
| S4 | Reject dialog | desk | same | reason quick-picks + free text, reason REQUIRED |
| S5 | Audit trail drawer | desk | same + viewer(read) | drafted→reviewed→committed chain |

Empty state S1: "Nothing waiting on you." ✔ · Loading: weave ✔ · Offline: n/a (desk) · Error: approve-failed toast with retry ✔

### 2. Component mapping
| Screen | Existing | New |
|---|---|---|
| S1 | SmartTable, chips, selvage | `BatchKeyboardBar` (J/K/A/R hint strip) |
| S2 | draft card (MARBIM), confidence bar | `SourcePanel` (doc render + region highlight) |
| S3 | — | `FieldDiff` (before/after grid) — also needed later by Order revisions (1.3): build shared |

### 3. Data contract (abridged to S1, S3)
```
S1 Pending list
READS:
  pending_changes: id, module, action, summary, source, ai_confidence,
                   created_at (age derived client-side), status,
                   required_role (derived from approval_rules — NEW, see §4)
  counts by module for filter badges — server aggregate
WRITES:
  approve.approveItem(id)        — optimistic row removal, rollback on error
  approve.rejectItem(id, reason) — reason non-empty server-enforced
  approve.batch(ids[], action)   — max 50, per-row results
SORT/FILTER: server-side (module, source, status, age, confidence bucket)
PAGINATION: server, 50/page (keyboard flow assumes stable order: created_at asc)
REALTIME: poll 30s (badge count only)

S3 Item detail (update)
READS:
  pending_changes.payload + CURRENT row of target_table (before-image
  fetched at view time — NOT stored; decision §8-1)
WRITES: same approve/reject
```

### 4. Final entity deltas
| Entity | Change | Reason |
|---|---|---|
| pending_changes | + `required_role` (derived at insert from approval_rules; denormalized for list filter) | S1 filter + badge |
| pending_changes | + `source_ref jsonb` (document_id + region coords for click-to-source) | S2 SourcePanel |
| pending_changes | `ai_confidence` → `field_confidence jsonb` (per-field, replaces single value; ⚠ kills the hardcoded 0.85) | S2 per-field bars |
| approval_rules | confirmed as designed in brief | S1 routing badges |

### 5. API surface (final)
| Operation | Kind | Auth | Called from | Idempotent | Notes |
|---|---|---|---|---|---|
| approve.list | query | manager+ | S1 | — | filters, page |
| approve.counts | query | manager+ | S1 badges | — | cached 30s |
| approve.getItem | query | manager+ | S2/S3 | — | joins target current row for diff |
| approve.approveItem | mutation | per approval_rules | S1/S2/S3 | yes (status guard) | re-validates Zod at approve |
| approve.rejectItem | mutation | per approval_rules | S4 | yes | reason required |
| approve.batch | mutation | per approval_rules | S1 | per-row | max 50 |
| approve.auditTrail | query | manager+, viewer read | S5 | — | |

### 6. State machine
`pending → approved (approveItem, role per rules, emits approve.committed{table,row})`
`pending → rejected (rejectItem, role per rules, emits approve.rejected)`
No other transitions. Approve on non-pending ⇒ 409.

### 7. Cross-module contracts
| Direction | Contract | Owner | Gate |
|---|---|---|---|
| consumes | Zod schema registry per target_table | each module | insert+approve validation |
| consumes | approval_rules | Settings X.3 | approve authorization |
| provides | `approve.committed` event | X.1 | modules refresh caches |
| provides | FieldDiff shared component | X.1 → 1.3 | — |

### 8. Conflicts & open questions — resolved
| # | Item | Resolution |
|---|---|---|
| 1 | Store before-image in row vs fetch-at-view for diffs | Fetch at view (stale-tolerant, simpler); revisit if audit needs frozen before-image for ⚖ tables → then snapshot at approve time only |
| 2 | Design showed confidence on manual drafts too | No — confidence renders only when source ∈ (marbim, extract); manual drafts show "—" |

### 9. Non-functional
- Load: list p95 < 300ms at 5k pending rows; batch(50) < 2s. k6 scenario `approve_inbox.js`.
- i18n: 41 new keys; "Approved with corrections" broke at bn length → shortened.
- Audit: every approve/reject writes audit_log (⚖).

### 10. Seed
30 pending items across 5 modules: 6 low-confidence (<70%), 3 aged >48h, 4 updates with diffs, 2 targeting a table whose Zod schema rejects (to demo the failure path).
