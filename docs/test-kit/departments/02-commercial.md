# Commercial (LC · UD · bank documents) — `commercial@fabricxai-fashion.test`

The desk that keeps the money paper legal. Password: `FabricXai-seed-2026`.

## Data already present
- Master LC **LC-2026-517**: USD 128,400.00 ±5%, issued 2026-06-29,
  **latest shipment 2026-09-15**, expiry 2026-10-06, active — covering PO-88203
- UDs **UD-118**, **UD-124** (active) authorizing bonded fabric
- Specimen LC advice for cross-checking: `documents/reference/LC-2026-517-advice.pdf`

## Test steps
1. **LC workbench**: open LC-2026-517 — the 3-day gap between planned ex-factory
   (2026-09-12) and latest shipment (09-15) should read as tension, not comfort. Move the
   shipment's planned date past 09-15 (or try to) — the **latest-shipment conflict** must
   flare as a red alert.
2. **UD balance**: open UD-118/124 — drawn vs authorized quantities must reconcile with the
   store's bonded GRNs and issues. Then coordinate with `store@`: attempt a bonded issue
   that overdraws the UD — **hard server-side block**, not a warning.
3. **BTB headroom**: with `procurement@`, raise an import PO that would exceed the
   back-to-back limit (a % of the master LC) — must refuse with the headroom number.
4. **Bank docs / EXP gate**: try to prepare bank submission for the shipment — the EXP
   number is **empty** on purpose; submission must refuse until `shipment@` records it.
5. **UD intake**: `documents/ud-scan/` — paste `UD-131.paste.txt` into intake kind
   *UD scan*; approve as owner; **UD-131** joins the workbench with FAB-POP-40S 41,500 m +
   FAB-INT-45 3,600 m authorized. Also run the OCR path: `UD-131.scan.jpg` has no text
   layer — extract its text per `extraction/GETTING-TEXT-OUT.md` §2 and compare with the
   `.paste.txt`.

## MARBIM prompts to try
- "How many days between our planned ex-factory and the LC latest shipment — and what
  happens if final inspection slips a week?"
- "Summarize what UD-118 still has headroom for."

## Must refuse
- Bonded issue with no UD reference; UD overdraw; import PO beyond BTB headroom;
  bank docs without EXP. Every one of these is the test passing.
