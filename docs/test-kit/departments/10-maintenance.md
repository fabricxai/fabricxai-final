# Maintenance — `maintenance@fabricxai-fashion.test` (Bangla UI)

Machines, breakdowns, preventive schedules. Password: `FabricXai-seed-2026`.

## Data already present
- **48 machines**: `DDL-8700-L*` single-needle lockstitch, `MO-6716S-*` 4-thread overlock,
  assigned to lines L1–L6
- 4 open tickets, 4 PM schedules, 5 spare parts with stock

## Test steps
1. **Breakdown flow**: production logs downtime on L2 → raise/claim the ticket here,
   record diagnosis + spare part used → close. The downtime on the production side and the
   ticket must reference the same machine (`DDL-8700-L2-*`).
2. **Spare stock**: consuming a part decrements its stock; consuming below zero refused.
3. **PM**: complete a due preventive task; the schedule rolls forward. Let one go overdue
   (or find one) — it must surface, not hide.
4. **Machine history**: a machine's page shows its tickets, PM history, and current line
   assignment; move a machine to another line and check the floor boards follow.

## MARBIM prompts to try
- "Which machine has the most breakdown tickets, and what were the causes?"
- (bn) "কোন মেশিনের PM বাকি আছে?"

## Must refuse
- Closing a ticket without diagnosis; negative spare stock; this role writing production
  output or wage data.
