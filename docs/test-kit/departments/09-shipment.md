# Finishing & Shipment — `shipment@fabricxai-fashion.test`

Cartons, packing lists, EXP, the door out. Password: `FabricXai-seed-2026`.

## Data already present
- Shipment **partial 1** (sea), planned ex-factory **2026-09-10**, **45 cartons**,
  finishing output recorded
- **EXP number: EMPTY** — deliberately
- Specimen packing list: `documents/reference/PL-88203-01-packing-list.pdf`

## Test steps
1. **Carton math**: cartons must tie to the order breakdown (24,000 pcs across
   Navy/White/Sky × S–XXL — the packing-list specimen shows the totals). Add cartons for
   remaining quantity; over-packing beyond order+tolerance (0%) must warn/refuse.
2. **The EXP gate**: with `commercial@`, attempt bank-document submission now — refused
   for missing EXP. Record EXP number `EXP-2026-4471-01` on the shipment, retry — the gate
   opens. This is the kit's cleanest live gate: empty → blocked → filled → open.
3. **LC window**: try moving actual ex-factory past the LC latest shipment (2026-09-15) —
   the conflict must flare (red, not a tooltip).
4. **Finishing output**: record today's finishing; it feeds the owner's exit funnel.
5. **Docs pack**: generate/inspect the packing list against the specimen PDF.

## MARBIM prompts to try
- "How many pieces are packed vs ordered on PO-88203, by colour?"
- "What blocks bank submission for this shipment right now?"

## Must refuse
- Bank docs without EXP; ex-factory beyond LC latest shipment without an alert;
  cartons exceeding contract quantity at 0% tolerance.
