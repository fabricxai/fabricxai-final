# Production — `production@fabricxai-fashion.test` (Bangla UI)

The sewing floor's numbers: plans, hourly output, downtime, endline. Password: `FabricXai-seed-2026`.

## Data already present
- 6 daily line plans (L1–L6), **96 hourly output entries**, 1 downtime, 6 endline counts
- Efficiency = earned minutes (SMV × output) / available minutes; DHU boards fed by quality

## Test steps
1. **Hourly board**: enter this hour's output for L1 against the plan; the line's
   efficiency updates from SMV × output. Enter an absurd figure (10× plan) — expect a
   sanity guard or at least a visible flag, not silent acceptance.
2. **Downtime**: log a mechanic call on L2 (reason-coded); it must subtract from available
   minutes and show on the line's day.
3. **Endline**: record endline counts; endline is production's **one writer** —
   confirm quality/analytics read the same number (no second entry point).
4. **Offline batch**: hourly entry supports `offline_key` idempotency — double-submit,
   one write.
5. **Day close**: close the day; late edits to a closed day must be refused or routed to
   an approval, not silently applied.
6. **Boards**: `/board` (the factory wallboard) and the owner dashboard must agree with
   what you entered — same rows, two audiences.

## MARBIM prompts to try
- (bn) "আজ L1 লাইনের efficiency কত?"
- "Which line lost the most minutes to downtime this week?"

## Must refuse
- Writing endline from any other module; entries on closed days; this role editing wage
  or LC data (403 / hidden).
