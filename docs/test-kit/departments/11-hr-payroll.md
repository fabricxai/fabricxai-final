# HR & Payroll — `hr@fabricxai-fashion.test`

Workers, attendance, the gazette, and the most locked-down surface in the product.
Password: `FabricXai-seed-2026`.

## Data already present
- **24 workers** (`L1-OP-01`…), designations/grades, on lines
- **624 attendance rows** (26 working days), OT hours included
- Active gazette **SRO-2023-12**, grades 1–7 (grade 1 basic 10,938.00 BDT;
  house rent = 50% of basic; medical 750 / transport 450 / food 1,250)

## The access wall — test it FIRST
- Payroll is **hr + owner only, enforced in code with a bodyless 403**. Sign in as
  `admin@` (supervisory everywhere else) and open payroll: **403, no body**. That is the
  product working. `planner@`, `finance@`, `production@` — same.
- Every payroll **read** is audited. After your session, `owner@` should find the reads in
  the audit log.

## Test steps
1. **Worker lifecycle**: add a worker (grade 5), transfer one between lines, exit one —
   effective dates respected in the next payroll.
2. **Attendance**: mark today's attendance with 2 hours OT for a few workers; the offline
   batch path applies here too (`offline_key` dedupe).
3. **Payroll run**: run the month against SRO-2023-12. Spot-check one grade-4 operator by
   hand: basic 8,800.00 + HR 4,400.00 + medical 750 + transport 450 + food 1,250; **OT =
   2 × (basic/208) × OT hours**. The payslip must tie to the paisa — money is exact
   strings here, never floats.
4. **Festival bonus**: two per year, pro-rated by service — check a mid-year joiner
   pro-rates.
5. **Gazette intake**: `documents/wage-gazette/` — kind *Wage gazette*, paste
   `SRO-2026-07-gazette.paste.txt`. Approve as owner → the new gazette lands **inactive**
   (effective 2026-12-01) alongside the active SRO-2023-12; verify grades against
   `expected.json`, then leave it inactive (or activate and re-run a future month to see
   versioned wages at work).
6. **Parallel-run gate** (go-live discipline): `pnpm payroll:parallel-run --period=YYYY-MM
   --sheet=<csv>` compares a month against the factory's own sheet — every net must be
   zero or explained. Non-negotiable before a real factory goes live.

## MARBIM prompts to try
- "What would a grade-4 operator with 20 OT hours gross this month?"
- MARBIM must NOT leak payroll to other roles — ask the same question as `planner@` and
  expect a refusal/absence.

## Must refuse
- Any non-hr/owner payroll access (bodyless 403); OT at any rate other than 2× basic/208;
  a payroll run touching a gazette that isn't active for the period.
