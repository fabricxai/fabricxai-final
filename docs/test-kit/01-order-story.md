# The order story — PO-88203 through the factory

One confirmed export order is running through FabricXAI Fashion. Every department guide
tests a slice of this thread; this file is the map. All values below are what the tenant's
database actually holds — if a screen disagrees, that's a finding.

## The order

| Fact | Value |
|---|---|
| Buyer | H&M (code `HM`) |
| PO | `PO-88203` |
| Style | `SH-4471` — men's shirt · 40s poplin, single needle |
| Quantity | 24,000 pcs (tolerance 0%) |
| Unit price / total | USD 5.35 / **USD 128,400.00** |
| Status | confirmed |
| Planned ex-factory | 2026-09-12 |
| Colours × sizes | Navy / White / Sky × S–XXL (15 breakdown cells, revision 1) |

## The money and customs paper (commercial)

- Master LC **LC-2026-517** — USD 128,400.00, ±5%, issued 2026-06-29,
  **latest shipment 2026-09-15**, expiry 2026-10-06, active.
- UDs **UD-118** and **UD-124** active for bonded fabric; the kit adds **UD-131** via intake.
- Invoice **INV-2026-0431** (USD 128,400.00) raised 2026-06-25; payables to suppliers exist.

## The calendar (TNA) — where the pressure is

Everything up to **cutting (2026-08-07)** is `late`; **sewing_start (2026-08-11)** is
`at_risk`; sewing_end (08-31) → finishing (09-04) → final inspection (09-07) →
**ex-factory 2026-09-12** are `on_track`. Three days of slack against the LC's latest
shipment of 09-15 — that tension is deliberate and drives the alerts screens show.

## Materials (store)

Items include shell fabric `FAB-POP-40S` (40s poplin), interlining `FAB-INT-45`, buttons
`TRM-BTN-18L`, thread `TRM-THR-40`, labels `TRM-LBL-MAIN`, poly bags `ACC-POLY-1`.
GRNs `CH-2026-0412 / 0418 / 0421` received 50 fabric rolls; issues against the order feed
cutting. A requisition with 3 lines is open.

## The floor

- **Cutting**: marker `MK-SH4471-A` (ratio S1-M2-L2-XL1, 84.6% efficiency), lays
  `LAY-0041/0042/0043`. LAY-0043 is **18 pcs short on M** — outside the 2% tolerance, so
  its cut report needs a human decision. 36 bundles ticketed with QR tokens.
  Wastage **3.4% against a 3.0% plan**.
- **Production**: 6 lines (L1–L6), daily plans, 96 hourly output entries, one downtime,
  endline counts. Efficiency and DHU derive from these.
- **Quality**: 6,460 inline checks, 24 fabric inspections, measurement spec for SH-4471,
  16 semantic defect codes, day-close records.
- **Sampling**: PP sample for SH-4471 **approved** (2 feedback rounds) — that approval is
  what legally opened cutting.

## The exit

Shipment partial 1 (sea), planned ex-factory 2026-09-10, **45 cartons** packed, finishing
output recorded. **EXP number is EMPTY** — bank document submission must refuse until
shipment sets it. Packing list specimen: `documents/reference/PL-88203-01-packing-list.pdf`.

## The people

24 workers (cards `L1-OP-01`…), 624 attendance rows (26 days), active wage gazette
`SRO-2023-12` with grades 1–7 (grade 1 basic 10,938.00 BDT). 48 machines
(`DDL-8700-*`, `MO-6716S-*`), 4 maintenance tickets, PM schedules.
BSCI follow-up audit (Bureau Veritas, 2026-07-21, score 68.5) with 4 findings and CAPs.

## The second order (intake test)

`documents/buyer-po/PO-88410-HM.pdf` is a **new** H&M PO (style SH-4522, 18,000 pcs,
USD 100,800.00, ex-factory 2026-11-20). It exists so document intake can be tested
end-to-end: extract → review confidence → approve → a second live order appears without
touching PO-88203.
