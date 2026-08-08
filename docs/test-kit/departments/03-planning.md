# Planning — `planner@fabricxai-fashion.test`

Factory structure and line loading. Password: `FabricXai-seed-2026`.

## Data already present
- 1 factory unit, 2 floors, lines **L1–L6** with manpower/machine capacity
- Daily line plans for the order; TNA calendar (see `01-order-story.md`)

## Test steps
1. **Factory tree**: rename a floor, adjust a line's capacity — persists and reflects on
   production boards.
2. **Line loading**: plan SH-4471 quantities across L1–L6 against the sewing window
   (2026-08-11 → 08-31). Overload one line past its capacity — the screen should surface
   it (capacity is planning's number; check it is not silently accepted).
3. **What-if**: move sewing_start later and watch the TNA at-risk statuses propagate
   (owner dashboard should agree).
4. **Second order**: once PO-88410 exists (buyer-PO intake approved), plan its 18,000 pcs
   with ex-factory 2026-11-20 — a clean-slate planning exercise.

## MARBIM prompts to try
- "Given the daily plans, do L1–L6 finish 24,000 pcs before 2026-08-31?"
- "Which line has the worst efficiency this week?"

## Must refuse / not offer
- Payroll, wage data (403 for this role); write access to modules outside planning's nav.
