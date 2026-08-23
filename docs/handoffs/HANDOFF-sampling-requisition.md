# HANDOFF — sampling: the requisition and the room's load

**Module:** `src/modules/sampling`

Written **before the build** — the rule CLAUDE.md keeps for what is built NEXT. A
prospective addendum to module 1.4, from the 2026-08-22 merchandiser design canvas:
two features the sample room's paper already carries and the module does not.

## §1 · Why these two, together

- **The requisition** is the sample's bill of materials as an ASK: the trims and
  fabric the room needs before it can make the piece, written by the merchandiser
  when the request is raised. The factory's own requisition sheets carry a second
  column the schema must not lose: what was ACTUALLY used. A sample sewn with a
  substitute zipper is the single most common reason a buyer's fit comment is
  really a trim comment, and today that fact lives in somebody's memory. Per line:
  as-specified, or substituted with a note saying what went in instead.
- **The room's load** answers the question asked before every "yes, we can
  develop that": how many samples is the room already carrying this month, and
  for whom. Counted from `sample_requests` — never entered — grouped by month
  and buyer, with the open count on top. Two is a quiet month and nineteen is a
  refusal; the number decides, so the number must be visible.

## §2 · Ownership and shape

One writer (rule 11): everything lives on `sample_requests` in `modules/sampling`.
The requisition is a `jsonb` column, not a child table — its lines have no identity
outside their request, are read and written as a set, and nothing else joins to
them. Buyer names in the load report are read through the order join the board
already uses. Quantities are decimal STRINGS with a free-text unit ("2.5 m",
"18 pcs") — they are consumption figures, not money, and never arithmetic inputs.

## §3 · Reads

- `roomLoad` (service): months back → per-month `{month, total, open, byBuyer[]}`,
  buyer resolved via the request's order where one exists, else the development
  bucket ("no order yet — development").
- `sampleTimeline` gains nothing: the requisition rides on the request row it
  already returns.

## §5 · Operations

| Operation | What it does | Refusals |
| --- | --- | --- |
| `setSampleRequisition` | Replace the request's requisition lines as a set (the ask). Editable until the request closes. | `request_not_found`, `request_closed` |
| `recordRequisitionUsage` | Mark one line's actual-vs-substitute (the answer). A substitution must say what went in. | `request_not_found`, `request_closed`, `requisition_line_missing`, `substitute_needs_note` |
| `roomLoad` | Count the room's load per month per buyer — derived, never entered. | none — an empty room is an empty report |

## §6 · State machines

None. Deliberately, and it needs saying because everything else in this module
moves through one: the requisition is not a workflow, it is two facts about the
same line — what was asked for and what was used — and neither fact transitions.
A line's `used` field goes from `pending` to exactly one of `as_specified` or
`substituted` and is then re-writable by the same op that set it, because the room
correcting its own record ("actually the substitute was the collar zip, not the
placket") must not require an admin. The request's own status machine
(`requested → in_progress → … → closed`) already exists and is what gates edits.

## §7 · Gates

No new server-side gates. The PP-approval gate is untouched. Both write ops refuse
on a closed request — a refusal, not a gate, and it reuses the existing
`sampling.errors.request_closed` sentence.

## §8 · Open questions

- There is no sample-room role in `role_name`; both ops gate `merchandiser`, like
  every other action in this module. If the room ever gets its own tablet login,
  `recordRequisitionUsage` is the op that should move to it.
- The load report counts requests, not garment-minutes. A blazer and a tee weigh
  the same. SMV-weighting would need the costing join and is deliberately out.
