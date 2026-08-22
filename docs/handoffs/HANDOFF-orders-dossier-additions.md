# HANDOFF — orders: fabric legs, drops & the third axis, colour approvals

Written BEFORE the build (CLAUDE.md: a new piece of work needs its contract first, §8
empty). This is an addendum to the orders module — three features from the 2026-08-22
merchandiser design canvas, each grounded in the factory's own working papers, none of
which the current schema can hold.

## §1 Why these three, together

All three are per-order facts the merchandiser tracks on paper today:

- **Fabric legs** — the order confirmation sheet carries FABRICS ETD / ETA / INHOUSE
  PLAN as separate columns: fabric has a life between booking and the store that the
  TNA collapses into one milestone. When it slips, WHERE it slipped decides who is
  chased (the mill, the forwarder, customs) and whether the booking's own late-delivery
  ladder is claimable.
- **Drops** — a real buyer PO ships one colour in two drops with separate latest-ship
  dates. One `planned_ex_factory_date` cannot represent it, and the LC check must run
  per drop: drop 1 clearing the credit while drop 2 breaches it is the normal case,
  not a corner.
- **Colour approvals** — the cloth order's conditions block is lab dips, bulk dye lots
  and shade continuity per colourway. Cutting a colour with no approved shade band is
  how a shade-mix refusal happens at the store.

Plus one schema decision taken now because it is cheaper before the grid is
relied on further: **the breakdown's third axis**. Real PO lines split by leg length
and by ratio-pack vs singles. `order_breakdowns` gains `variant text NOT NULL
DEFAULT ''` — additive; the empty string means "no third axis", the unique cell key
becomes (style, revision, color, size, variant). Readers that aggregate by
(color, size) — cutting, shipment — keep summing correctly; they see the union of
variants, which is what a marker or a carton count wants.

## §2 Ownership

All tables live in `modules/orders` (one writer — rule 11). Colour approvals are the
merchandiser's record of the BUYER's approvals; the 4-point fabric result stays
quality's and is not duplicated here. Fabric legs are the merchandiser's chase view;
the store's GRN remains the truth of "in-house" and a leg never overrides it.

## §3 Entities

`order_fabric_legs` — one row per (order, leg). Legs, in transit order:
`booking_placed · pi_received · ex_mill · on_vessel · at_port · customs_cleared ·
in_house`. Cell = planDate?, actualDate?, note? — the inputs-checklist cell shape,
because that is the paper habit. No status column: late is derived (actual > plan, or
today > plan with no actual), never stored.

`order_drops` — one row per (order, dropNo). qty int, shipDate (the drop's own LSD),
note?. Constraint: qty > 0. The order's `planned_ex_factory_date` stays the LAST
drop's date (the order leaves the factory when the last drop does); the service keeps
it in step.

`order_colour_approvals` — one row per (order, color, stage). Stages:
`lab_dip · bulk_lot · shade_band`. status: `pending · sent · approved · rejected`;
decidedOn date?, note?. Colours are free text matched against the breakdown's colours
by the screen, not an FK — an approval can be recorded before the grid revision that
names the colour lands.

## §5 Operations

- `setFabricLeg(ctx, {orderId, leg, planDate?, actualDate?, note?})` — upsert, whole-cell.
- `saveDrops(ctx, {orderId, drops: [{dropNo, qty, shipDate, note?}]})` — whole-list
  replace; refuses when Σqty exceeds contracted+tolerance (same gate arithmetic as the
  breakdown); moves `planned_ex_factory_date` to max(shipDate) in-transaction.
- `setColourApproval(ctx, {orderId, color, stage, status, decidedOn?, note?})` — upsert.

Writers: the orders WRITERS set (merchandiser, commercial, planner). All refuse on a
settled order, same sentence as the inputs checklist.

## §6 State

Only colour approvals carry one: pending → sent → approved | rejected; rejected → sent
(a re-submission). Not a `defineStateMachine` — the transitions are total (any
correction is legal, the record is the merchandiser's own log, not a gate), and a
machine would refuse the "the buyer verbally approved months ago, record it now" case
the paper handles daily.

## §7 Gates

None new server-side. The LC check per drop REUSES `commercial.lcsForOrders` float
arithmetic against each drop's own date on the screen; the hard gate at shipment
(`lcLatestShipment`) already exists and stays where it is. Cutting is deliberately NOT
blocked on shade-band here — quality's fabric gate owns refusals; this screen warns.

## §10 Seed

Running-factory seed: DENIM gets a full fabric-leg trail with one late leg; POLO gets
two drops (its proposed pull-in already on the ship-date trail) and three colours with
heather-grey stalled at shade band; JKT stays empty — the untouched state must render.

## §8 Acceptance

(empty — filled when the build is checked against this)
