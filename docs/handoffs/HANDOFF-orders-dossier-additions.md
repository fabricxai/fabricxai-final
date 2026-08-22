# HANDOFF — orders: fabric legs, drops & the third axis, colour approvals

**Module:** `src/modules/orders`

Written **before the build** — the rule CLAUDE.md keeps for what is built NEXT,
honoured in the right order for once. This is a prospective addendum to the orders
module, not a retroactive description: three features from the 2026-08-22
merchandiser design canvas, each grounded in the factory's own working papers, plus
one schema decision taken now because it is cheaper before the grid hardens further.

## §1 · Why these three, together

All three are per-order facts the merchandiser tracks on paper today:

- **Fabric legs** — the order confirmation sheet carries FABRICS ETD / ETA / INHOUSE
  PLAN as separate columns: fabric has a life between booking and the store that the
  TNA collapses into one milestone. When it slips, WHERE it slipped decides who is
  chased (the mill, the forwarder, customs) and whether the booking's own
  late-delivery ladder is claimable.
- **Drops** — a real buyer PO ships one colour in two drops with separate latest-ship
  dates. One `planned_ex_factory_date` cannot represent it, and the LC float must be
  read per drop: drop 1 clearing the credit while drop 2 breaches it is the normal
  case, not a corner.
- **Colour approvals** — the cloth order's conditions block is lab dips, bulk dye
  lots and shade continuity per colourway. Cutting a colour with no approved shade
  band is how a shade-mix refusal happens at the store.

**The third axis, settled now.** Real PO lines split by leg length and by ratio-pack
vs singles. `order_breakdowns` gains `variant text NOT NULL DEFAULT ''` — additive;
empty string means "no third axis"; the unique cell key becomes (style, revision,
color, size, variant). Readers that aggregate by (color, size) — cutting, shipment —
keep summing correctly: they see the union of variants, which is what a marker or a
carton count wants. NOT NULL with a default rather than nullable, because two NULLs
are distinct to a unique index and the dedupe guarantee must hold.

## §2 · Ownership

All tables live in `modules/orders` (one writer — rule 11). Colour approvals are the
merchandiser's record of the BUYER's approvals; the 4-point fabric result stays
quality's and is not duplicated here. Fabric legs are the merchandiser's chase view;
the store's GRN remains the truth of "in-house" and a leg never overrides it.

## §3 · Entities

`order_fabric_legs` — one row per (order, leg). Legs, in transit order:
`booking_placed · pi_received · ex_mill · on_vessel · at_port · customs_cleared ·
in_house`. Cell = planDate?, actualDate?, note? — the inputs-checklist cell shape,
because that is the paper habit. No status column: late is derived (actual > plan, or
today past plan with no actual), never stored.

`order_drops` — one row per (order, dropNo). qty int > 0, shipDate (the drop's own
latest-ship date), note?. The order's `planned_ex_factory_date` stays the LAST
drop's date — the order leaves the factory when the last drop does — and the service
keeps it in step inside the same transaction.

`order_colour_approvals` — one row per (order, color, stage). Stages:
`lab_dip · bulk_lot · shade_band`. status: `pending · sent · approved · rejected`;
decidedOn date?, note?. Colours are free text matched against the breakdown's colours
by the screen, not an FK — an approval can be recorded before the grid revision that
names the colour lands.

## §5 · Operations

| operation | what it does |
|---|---|
| `setFabricLeg` | Upsert one (order, leg) cell — plan date, actual date, note; whole-cell semantics like the inputs checklist. Refuses on a settled order. |
| `saveDrops` | Replace the order's drop list wholesale. Refuses Σqty outside contracted ± tolerance (same arithmetic as the breakdown gate); moves `planned_ex_factory_date` to max(shipDate) in the same transaction. |
| `setColourApproval` | Upsert one (order, color, stage) row — status, decidedOn, note. Refuses on a settled order. |

Writers: the orders WRITERS set (merchandiser, commercial, planner), the same
`requireRole` gate as every other order fact.

## §6 · State machines

None, deliberately. Colour approvals carry a status word, but it is a merchandiser's
own log of what the buyer said, not a gate the server enforces — and the paper habit
this replaces includes "the buyer verbally approved this months ago, record it now",
which a transition table would refuse. A wrong status here is corrected by typing the
right one, with `updatedBy` saying who; nothing downstream commits on it, so there is
no illegal-transition 409 to give. The drops list and the fabric legs have no
lifecycle at all: a drop is a fact about quantity and a date, a leg is a pair of
dates, and inventing states for either would be ceremony without a decision behind it.

## §7 · Gates

None new. The per-drop LC float REUSES `commercial.lcsForOrders` arithmetic against
each drop's own date, on the screen; the hard gate at shipment (LC latest-shipment,
rule 8) already exists server-side and stays where it is. Cutting is deliberately NOT
blocked on shade band here — quality's fabric gate owns refusals; this screen warns.

## §10 · Seed

Running-factory seed: DENIM gets a full fabric-leg trail with one late leg; POLO gets
two drops and three colours with one stalled at shade band; JKT stays untouched — the
empty state must render.

## §8 · Open questions

(empty — this is a prospective contract; questions land here as the build finds them)
