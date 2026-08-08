# Finance — `finance@fabricxai-fashion.test`

Invoices, payables, receivables — every number an exact string. Password: `FabricXai-seed-2026`.

## Data already present
- Export invoice **INV-2026-0431** — USD 128,400.00 against PO-88203 (2026-06-25)
- 3 payables to the seeded suppliers; 1 receivable
- LC-2026-517 is the collection instrument; EXP gate applies before bank submission

## Test steps
1. **Receivable**: record a partial collection against INV-2026-0431; outstanding must be
   exact to the cent (USD buyer-side).
2. **Payables**: age the three payables; settle one in BDT — currency stays attached to
   every amount, USD and BDT never silently mix.
3. **Invoice for PO-88410** (after intake approval): raise the export invoice from the
   order — 18,000 × 5.60 = **USD 100,800.00**; a hand-typed different total should
   reconcile-warn.
4. **Costing tie-out**: with `merchandiser@`'s cost sheet, gross margin on PO-88203 =
   invoice value vs BOM cost × quantity; the 10% floor policy is visible here.
5. **Money discipline** (spot check anywhere): amounts render with currency, no float
   artifacts (no `128400.000000001`), and money fields refuse bare numbers without
   currency.

## MARBIM prompts to try
- "What is outstanding on INV-2026-0431 and when is the LC expiry?"
- "Total payables due in the next 30 days, by supplier?"

## Must refuse
- Payroll access (bodyless 403 — finance is explicitly NOT on the payroll allow-list);
  writes into analytics; a payment recorded without currency.
