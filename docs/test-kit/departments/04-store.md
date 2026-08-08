# Store — `store@fabricxai-fashion.test` (Bangla UI)

Fabric and trims in, issues out — with the bonded wall. Password: `FabricXai-seed-2026`.
This login's locale is **bn**: the floor screens render in Bangla against the same rows.

## Data already present
- 7 items (`FAB-POP-40S`, `FAB-PIQ-180`, `FAB-INT-45`, `TRM-BTN-18L`, `TRM-THR-40`,
  `TRM-LBL-MAIN`, `ACC-POLY-1`), 3 locations
- GRNs `CH-2026-0412 / 0418 / 0421` (non-bonded), **50 rolls**, an issue with 12 lines
  feeding cutting, 1 open requisition (3 lines)

## Test steps
1. **GRN**: receive a new challan against the procurement PO; roll-level entry for fabric.
   Then the **offline path**: submit the same GRN twice with the same `offline_key` — the
   second must dedupe to one write (idempotency is the feature).
2. **Bonded GRN**: receive bonded fabric and try to save **without a UD reference** —
   refused. Reference UD-118 — accepted; UD drawn quantity moves.
3. **Bonded issue / overdraw**: issue bonded fabric to cutting beyond the UD's remaining
   balance — **hard block** with the number (legal exposure, not UX preference).
4. **Requisition**: approve/fulfil the open requisition; stock moves by roll.
5. **Reconciliation**: rolls received (50) minus issued must equal on-hand by location;
   the cutting module's `rollsDrawn` on LAY-0041..43 lists real roll ids from the issue.
6. After **UD-131** is approved from intake (commercial), it must appear in this screen's
   UD picklist for bonded receipts.

## MARBIM prompts to try
- "How many metres of 40s poplin are on hand and how much is committed to PO-88203?"
- (in Bangla) "নেভি পপলিন কত মিটার স্টকে আছে?"

## Must refuse
- Bonded flows without UD; overdraw; duplicate offline submissions creating double stock;
  editing wage or LC data (not this role's surface).
