# Quality — `quality@fabricxai-fashion.test` (Bangla UI)

Inline checks, fabric inspection, measurement specs, DHU. Password: `FabricXai-seed-2026`.

## Data already present
- **6,460 inline checks**, 24 fabric inspections (4-point), 72 DHU daily rows
- 16 semantic defect codes (the seeded default set — one button per defect, no duplicates)
- Measurement spec for SH-4471; day-close records; 24 workers on lines

## Test steps
1. **Inline capture**: record passes and defects at an endline station — defect must come
   from the code table (free-text defects are not a thing; that's the point of the codes).
   DHU for the line/day recomputes: defects per hundred units.
2. **Fabric inspection**: 4-point a received roll from GRN `CH-2026-0421`; fail it and
   check the store sees the roll's status.
3. **Measurement chart intake**: `documents/measurement-chart/` — paste the laid-out
   `.paste.txt` (or upload the CSV, which auto-fills), kind *Measurement chart*. Approve as
   owner; the graded points (4 POMs × 5 sizes, names like "A Chest 1cm below armhole —
   size M") land on SH-4471. **Then run the negative**: paste the same chart flattened to
   one line and watch for the shifted-grid failure in the draft — catch it in the inbox
   and reject with a reason.
4. **Final inspection**: run an AQL-style final on packed cartons (45 exist) ahead of the
   2026-09-07 final-inspection milestone.
5. **Day close**: close the QC day; reopening needs authority.

## MARBIM prompts to try
- "What is DHU on L3 this week and which defect code dominates?"
- (bn) "আজকের সবচেয়ে বেশি ডিফেক্ট কোনটা?"

## Must refuse
- A defect code not in the table; measurement points without sizes on a graded style;
  edits to a closed QC day.
