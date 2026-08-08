# Cutting — `cutting@fabricxai-fashion.test` (Bangla UI)

Markers, lays, cut reports, bundles — behind the PP gate. Password: `FabricXai-seed-2026`.

## Data already present
- Marker **MK-SH4471-A**: ratio S1·M2·L2·XL1, efficiency 84.60%, width 58", lay 6.40 m
- Lays **LAY-0041 / 0042 / 0043** (status cut), drawing real store rolls
- 3 cut reports; **LAY-0043 is 18 pcs short on M** — 16.4% out on that cell against a 2%
  tolerance, one accepted-variance cell elsewhere
- **36 bundles** of ≤30 pcs with QR tokens; wastage **3.4% vs 3.0% plan**

## Test steps
1. **The variance decision**: open LAY-0043's cut report — the M-cell must present as a
   decision (accept the short / recut), not a passed check. Accept with a note; the
   decision must land in the audit trail.
2. **New lay**: spread a new lay for Sky colour against the marker; draw rolls the store
   actually issued (the gate: a lay may only draw issued fabric). Enter the cut cells; a
   cell inside 2% passes silently, outside 2% demands the decision.
3. **Bundles**: generate bundles from the new report — ≤30 pcs each, QR tokens distinct
   from row ids; scan-progress one bundle to sewing.
4. **The PP gate**: try to start cutting for style **SH-4522** (order PO-88410, no PP
   approval yet) — **server-side refusal**. Then have `merchandiser@` run its PP sample to
   approval and watch cutting open. This is the single most important gate on the floor.
5. **Wastage**: after your lay, wastage recomputes (drawn vs marker consumption) — check
   the % moves and both operands show.

## Offline
Cut-report entry supports the offline batch path — submit with an `offline_key`, resubmit,
confirm one write.

## MARBIM prompts to try
- "Which lay is short and by how much against tolerance?"
- (bn) "LAY-0043 এ কোন সাইজ কম কাটা হয়েছে?"

## Must refuse
- Cutting an unapproved style (PP gate); a lay drawing rolls never issued; bundle
  quantities that don't tie to the report cells.
